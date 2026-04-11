import multer from 'multer';

const storage = multer.memoryStorage();

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_CHAT_TYPES = [
    ...ALLOWED_IMAGE_TYPES,
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const imageFilter = (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false);
    }
};

const chatFilter = (req, file, cb) => {
    if (ALLOWED_CHAT_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: images, pdf, doc, docx`), false);
    }
};

/** Upload up to 5 task images */
export const uploadTaskImages = multer({
    storage,
    fileFilter: imageFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 5,
    },
}).array('images', 5);

/** Upload up to 5 chat attachments (images + documents) */
export const uploadChatAttachments = multer({
    storage,
    fileFilter: chatFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 5,
    },
}).array('attachments', 5);

/** Handle multer errors and forward a clean JSON response */
export const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
            LIMIT_FILE_COUNT: 'Too many files. Maximum is 5 images',
            LIMIT_UNEXPECTED_FILE: `Unexpected field: ${err.field}`,
        };
        return res.status(400).json({
            status: 'error',
            message: messages[err.code] || err.message,
        });
    }
    if (err?.message?.startsWith('Invalid file type')) {
        return res.status(400).json({
            status: 'error',
            message: err.message,
        });
    }
    next(err);
};
