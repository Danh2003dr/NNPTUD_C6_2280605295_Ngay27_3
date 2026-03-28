let jwt = require('jsonwebtoken')
let userController = require('../controllers/users')
module.exports = {
    checkLogin: async function (req, res, next) {
        let token
        if (req.cookies.token_login_tungNT) {
            token = req.cookies.token_login_tungNT
        } else {
            let auth = req.headers.authorization;
            if (!auth || !auth.startsWith("Bearer")) {
                return res.status(403).send("ban chua dang nhap");
            }
            token = auth.split(" ")[1];
            if (!token) {
                return res.status(403).send("ban chua dang nhap");
            }
        }
        try {//private - public
            let result = jwt.verify(token, "secret")
            if (result.exp * 1000 > Date.now()) {
                let user = await userController.FindById(result.id)
                if (!user) {
                    return res.status(403).send("ban chua dang nhap");
                }
                req.user = user;
                return next()
            } else {
                return res.status(403).send("ban chua dang nhap");
            }
        } catch (error) {
            return res.status(403).send("ban chua dang nhap");
        }

    },
    CheckPermission: function (...requiredRole) {
        return function (req, res, next) {
            let role = req.user.role.name;
            console.log(role);
            if (requiredRole.includes(role)) {
                next();
            } else {
                res.status(403).send("ban khong co quyen")
            }
        }
    }
}