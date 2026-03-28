const crypto = require("crypto");
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
 * @param {Buffer} buffer — nội dung file CSV (UTF-8)
 * @param {(to: string, username: string, plainPassword: string) => Promise<void>} sendCredentialsMail
 */
async function importUsersFromCsvBuffer(buffer, sendCredentialsMail) {
    const text = buffer.toString("utf8");
    const parsed = parseUserCsv(text);
    if (parsed.error) {
        return { ok: false, message: parsed.error, results: [] };
    }

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

    for (const row of parsed.rows) {
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

module.exports = {
    importUsersFromCsvBuffer,
    parseUserCsv,
    randomPassword16,
};
