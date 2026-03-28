const path = require("path");
const nodemailer = require("nodemailer");

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false,
    auth: {
        user: process.env.MAILTRAP_USER || "",
        pass: process.env.MAILTRAP_PASS || "",
    },
});

const welcomeBannerPath = path.join(__dirname, "emailAssets", "welcome.png");

module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || "admin@hehehe.com",
            to: to,
            subject: "reset pass",
            text: "click vo day de doi pass",
            html: "click vo <a href=" + url + ">day</a> de doi pass",
        });
    },

    /**
     * Gửi mật khẩu tạm qua Mailtrap — HTML có ảnh nhúng (CID) để kiểm tra trên Mailtrap.
     */
    sendCredentialsMail: async function (to, username, plainPassword) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || "noreply@nnptud.local",
            to,
            subject: "Thông tin đăng nhập tài khoản",
            text:
                `Xin chào ${username}, mật khẩu đăng nhập 16 ký tự của bạn là: ${plainPassword}`,
            html:
                `<p>Xin chào <strong>${escapeHtml(username)}</strong>,</p>` +
                `<p>Tài khoản đã được tạo với quyền <strong>user</strong>. Mật khẩu (16 ký tự):</p>` +
                `<p><code style="font-size:16px;letter-spacing:1px">${escapeHtml(plainPassword)}</code></p>` +
                `<p><img src="cid:welcome-banner" alt="Welcome" width="40" height="40" /></p>`,
            attachments: [
                {
                    filename: "welcome.png",
                    path: welcomeBannerPath,
                    cid: "welcome-banner",
                },
            ],
        });
    },
};
