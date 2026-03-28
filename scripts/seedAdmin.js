/**
 * Tao tai khoan ADMIN + role ADMIN (neu chua co) de dang nhap Postman.
 * Chay: node scripts/seedAdmin.js
 * Hoac: node scripts/seedAdmin.js myadmin MyPass123 admin@mail.com
 */
require("dotenv").config();
const mongoose = require("mongoose");
const roleModel = require("../schemas/roles");
const cartSchema = require("../schemas/carts");
const userController = require("../controllers/users");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/NNPTUD-C6";

const username = process.argv[2] || "admin";
const password = process.argv[3] || "Admin@123";
const email = process.argv[4] || "admin@local.test";

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log("DB:", MONGO_URI);

    let adminRole = await roleModel.findOne({
        name: "ADMIN",
        isDeleted: false,
    });
    if (!adminRole) {
        adminRole = await roleModel.create({
            name: "ADMIN",
            description: "Quan tri he thong",
        });
        console.log("Da tao role ADMIN:", adminRole._id.toString());
    } else {
        console.log("Role ADMIN da ton tai:", adminRole._id.toString());
    }

    let userRole = await roleModel.findOne({
        name: { $regex: /^user$/i },
        isDeleted: false,
    });
    if (!userRole) {
        userRole = await roleModel.create({
            name: "user",
            description: "Nguoi dung thuong",
        });
        console.log('Da tao role "user" cho import CSV:', userRole._id.toString());
    }

    const existing = await userController.FindByUsername(username);
    if (existing) {
        console.log("Username da ton tai:", username);
        console.log("Neu muon dat lai mat khau, xoa user trong MongoDB hoac doi username o lenh.");
        await mongoose.disconnect();
        process.exit(0);
    }

    try {
        const newUser = userController.CreateAnUser(
            username,
            password,
            email,
            adminRole._id,
            "Administrator",
            undefined,
            true,
            0
        );
        await newUser.save();
        const cart = new cartSchema({ user: newUser._id });
        await cart.save();
        console.log("Da tao ADMIN thanh cong.");
        console.log("  username:", username);
        console.log("  password:", password);
        console.log("  email:   ", email);
    } catch (e) {
        console.error("Loi:", e.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

main();
