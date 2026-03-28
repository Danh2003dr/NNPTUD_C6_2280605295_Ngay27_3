let multer = require('multer')
let path = require('path')
//luu o dau?luu file ten la gi ?
let storageSetting = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/")
    },
    filename: function (req, file, cb) {
        //filename = name + ext
        let ext = path.extname(file.originalname)
        let name = Date.now() + "-" + Math.round(Math.random() * 2000_000_000) + ext;
        cb(null, name)
    }
})
let filterImage = function (req, file, cb) {
    if (file.mimetype.startsWith('image')) {
        cb(null, true)
    } else {
        cb(new Error("file dinh dang khong dung"))
    }
}
let filterExcel = function (req, file, cb) {
    if (file.mimetype.includes('spreadsheetml')) {
        cb(null, true)
    } else {
        cb(new Error("file dinh dang khong dung"))
    }
}
let filterCsv = function (req, file, cb) {
    let nameOk = file.originalname && file.originalname.toLowerCase().endsWith('.csv')
    let mimeOk =
        file.mimetype === 'text/csv' ||
        file.mimetype === 'application/csv' ||
        file.mimetype === 'text/plain' ||
        file.mimetype === 'application/vnd.ms-excel'
    if (nameOk || mimeOk) {
        cb(null, true)
    } else {
        cb(new Error("Chi chap nhan file .csv"))
    }
}
/** CSV hoac Excel .xlsx cho import user */
let filterUserImport = function (req, file, cb) {
    let n = (file.originalname || '').toLowerCase()
    let csvOk = n.endsWith('.csv')
    let xlsxOk = n.endsWith('.xlsx')
    let mime = file.mimetype || ''
    let mimeCsv =
        mime === 'text/csv' ||
        mime === 'application/csv' ||
        mime === 'text/plain'
    let mimeXlsx =
        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        (mime.includes && mime.includes('spreadsheetml'))
    let mimeBin = mime === 'application/octet-stream'
    if (csvOk || xlsxOk || mimeCsv || mimeXlsx || (mimeBin && (csvOk || xlsxOk))) {
        cb(null, true)
    } else {
        cb(new Error("Chi chap nhan file .csv hoac .xlsx"))
    }
}
module.exports = {
    uploadImage: multer({
        storage: storageSetting,
        limits: 5 * 1024 * 1024,
        fileFilter: filterImage
    }),
    uploadExcel: multer({
        storage: storageSetting,
        limits: 5 * 1024 * 1024,
        fileFilter: filterExcel
    }),
    uploadCsv: multer({
        storage: storageSetting,
        limits: 2 * 1024 * 1024,
        fileFilter: filterCsv
    }),
    uploadUserImport: multer({
        storage: storageSetting,
        limits: 5 * 1024 * 1024,
        fileFilter: filterUserImport
    })
}