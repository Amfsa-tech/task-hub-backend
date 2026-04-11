import cloudinary from '../config/cloudinary.js';

/**
 * Upload a single buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer from multer
 * @param {string} folder - Cloudinary folder path
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadToCloudinary = (buffer, folder, resourceType = 'image') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
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
