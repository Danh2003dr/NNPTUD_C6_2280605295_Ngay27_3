const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const roleModel = require("../schemas/roles");
const cartSchema = require("../schemas/carts");
const userController = require("../controllers/users");

function randomPassword16() {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.randomBytes(16);
    let s = "";
    for (let i = 0; i < 16; i++) s += chars[bytes[i] % chars.length];
    return s;
}

function parseUserCsv(text) {
    const clean = text.replace(/^\uFEFF/, "");
    const lines = clean
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length < 2) {
        return { rows: [], error: "File rỗng hoặc thiếu dữ liệu (cần header + ít nhất 1 dòng)" };
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const iu = header.indexOf("username");
    const ie = header.indexOf("email");
    if (iu === -1 || ie === -1) {
        return {
            rows: [],
            error: 'Dòng đầu phải có cột "username" và "email"',
        };
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim());
        const maxIdx = Math.max(iu, ie);
        if (parts.length <= maxIdx) continue;
        rows.push({
            username: parts[iu] || "",
            email: (parts[ie] || "").toLowerCase(),
        });
    }
    return { rows };
}

/**
 * Sheet đầu tiên: hàng 1 là header username | email (không phân biệt hoa thường).
 */
async function parseUserExcel(buffer) {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) {
            return { rows: [], error: "File Excel không có sheet" };
        }
        const headerRow = sheet.getRow(1);
        const maxCol = Math.max(headerRow.cellCount, sheet.columnCount || 0, 10);
        const header = [];
        for (let c = 1; c <= maxCol; c++) {
            const v = headerRow.getCell(c).value;
            const text =
                v == null
                    ? ""
                    : typeof v === "object" && v.text != null
                      ? String(v.text)
                      : String(v);
            header.push(text.trim().toLowerCase());
        }
        const iu = header.indexOf("username");
        const ie = header.indexOf("email");
        if (iu === -1 || ie === -1) {
            return {
                rows: [],
                error: 'Hàng đầu phải có cột "username" và "email"',
            };
        }
        const colU = iu + 1;
        const colE = ie + 1;
        const rows = [];
        for (let r = 2; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            let u = row.getCell(colU).value;
            let e = row.getCell(colE).value;
            const cellStr = (val) => {
                if (val == null) return "";
                if (typeof val === "object" && val.text != null) return String(val.text).trim();
                return String(val).trim();
            };
            u = cellStr(u);
            e = cellStr(e).toLowerCase();
            if (!u && !e) continue;
            rows.push({ username: u, email: e });
        }
        if (rows.length === 0) {
            return { rows: [], error: "Không có dòng dữ liệu nào sau header" };
        }
        return { rows };
    } catch (e) {
        return { rows: [], error: "Không đọc được file Excel (.xlsx): " + e.message };
    }
}

async function importParsedRows(parsedRows, sendCredentialsMail) {
    const userRole = await roleModel.findOne({
        name: { $regex: /^user$/i },
        isDeleted: false,
    });
    if (!userRole) {
        return {
            ok: false,
            message: 'Không tìm thấy role tên "user" trong database',
            results: [],
        };
    }

    const results = [];

    for (const row of parsedRows) {
        if (!row.username || !row.email) {
            results.push({
                username: row.username,
                email: row.email,
                status: "skipped",
                reason: "Thiếu username hoặc email",
            });
            continue;
        }

        const session = await mongoose.startSession();
        let committed = false;
        let plainPass = "";
        try {
            session.startTransaction();
            const existsUser = await userController.FindByUsername(row.username);
            const existsEmail = await userController.FindByEmail(row.email);
            if (existsUser || existsEmail) {
                await session.abortTransaction();
                results.push({
                    username: row.username,
                    email: row.email,
                    status: "error",
                    reason: "Trùng username hoặc email",
                });
            } else {
                plainPass = randomPassword16();
                const newUser = userController.CreateAnUser(
                    row.username,
                    plainPass,
                    row.email,
                    userRole._id,
                    row.username,
                    undefined,
                    false,
                    0
                );
                await newUser.save({ session });
                const newCart = new cartSchema({ user: newUser._id });
                await newCart.save({ session });
                await session.commitTransaction();
                committed = true;
            }
        } catch (e) {
            try {
                await session.abortTransaction();
            } catch (abortErr) { /* ignore */ }
            results.push({
                username: row.username,
                email: row.email,
                status: "error",
                reason: e.message,
            });
        } finally {
            await session.endSession();
        }

        if (!committed) continue;

        try {
            await sendCredentialsMail(row.email, row.username, plainPass);
            results.push({
                username: row.username,
                email: row.email,
                status: "ok",
            });
        } catch (mailErr) {
            results.push({
                username: row.username,
                email: row.email,
                status: "created_mail_failed",
                reason: mailErr.message,
            });
        }
    }

    return { ok: true, results };
}

/**
 * @param {Buffer} buffer
 * @param {string} originalname — tên file gốc (đuôi .csv hoặc .xlsx)
 */
async function importUsersFromBuffer(buffer, originalname, sendCredentialsMail) {
    const ext = path.extname(originalname || "").toLowerCase();
    let parsed;

    if (ext === ".xlsx") {
        parsed = await parseUserExcel(buffer);
    } else if (ext === ".csv" || ext === "" || ext === ".txt") {
        parsed = parseUserCsv(buffer.toString("utf8"));
    } else {
        return {
            ok: false,
            message: "Chỉ hỗ trợ file .csv hoặc .xlsx (Excel)",
            results: [],
        };
    }

    if (parsed.error) {
        return { ok: false, message: parsed.error, results: [] };
    }

    return importParsedRows(parsed.rows, sendCredentialsMail);
}

/** Giữ tương thích code cũ */
async function importUsersFromCsvBuffer(buffer, sendCredentialsMail) {
    return importUsersFromBuffer(buffer, "import.csv", sendCredentialsMail);
}

module.exports = {
    importUsersFromBuffer,
    importUsersFromCsvBuffer,
    parseUserCsv,
    parseUserExcel,
    randomPassword16,
};
