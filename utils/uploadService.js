import cloudinary from '../config/cloudinary.js';

const UPLOAD_TIMEOUT = parseInt(process.env.CLOUDINARY_TIMEOUT_MS, 10) || 120000;
const MAX_RETRIES = parseInt(process.env.CLOUDINARY_MAX_RETRIES, 10) || 2;

/**
 * Upload a single buffer to Cloudinary (single attempt).
 */
const uploadOnce = (buffer, folder, resourceType = 'image') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
                timeout: UPLOAD_TIMEOUT,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve({ url: result.secure_url, publicId: result.public_id });
            }
        );
        stream.end(buffer);
    });
};

/**
 * Upload a single buffer to Cloudinary with retry on timeout.
 * @param {Buffer} buffer - File buffer from multer
 * @param {string} folder - Cloudinary folder path
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadToCloudinary = async (buffer, folder, resourceType = 'image') => {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await uploadOnce(buffer, folder, resourceType);
        } catch (error) {
            lastError = error;
            const isTimeout = error.name === 'TimeoutError' || error.http_code === 499;
            if (!isTimeout || attempt === MAX_RETRIES) break;
            const delay = 1000 * 2 ** attempt;
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastError;
};

/**
 * Upload multiple file buffers to Cloudinary in parallel.
 * @param {Express.Multer.File[]} files - Array of multer file objects
 * @param {string} folder - Cloudinary folder path
 * @returns {Promise<Array<{ url: string, publicId: string }>>}
 */
export const uploadMultipleToCloudinary = async (files, folder, resourceType = 'image') => {
    if (!files || files.length === 0) return [];
    return Promise.all(files.map((file) => uploadToCloudinary(file.buffer, folder, resourceType)));
};

/**
 * Delete a single asset from Cloudinary by public ID.
 * @param {string} publicId
 * @returns {Promise<void>}
 */
export const deleteFromCloudinary = async (publicId) => {
    await cloudinary.uploader.destroy(publicId);
};
