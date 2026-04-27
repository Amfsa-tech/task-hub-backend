import { Parser } from 'json2csv';
import * as Sentry from '@sentry/node';

/**
 * Universal function to send data as CSV or JSON
 * @param {Object} res - Express response object
 * @param {Array} data - The array of objects to export
 * @param {Array} fields - Specific fields/columns to include in CSV
 * @param {String} filename - Name of the file to be downloaded
 * @param {String} format - 'csv' or 'json' (defaults to json)
 */
export const sendExportResponse = (res, data, fields, filename, format = 'json') => {
    if (format === 'csv') {
        try {
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(data);
            
            res.header('Content-Type', 'text/csv');
            res.attachment(`${filename}_${Date.now()}.csv`);
            return res.send(csv);
        } catch (err) {
            console.error('CSV Export Error:', err);
            Sentry.captureException(err);
            return res.status(500).json({ status: 'error', message: 'Failed to generate CSV' });
        }
    }

    // Default to JSON if not CSV
    return res.json({
        status: 'success',
        count: data.length,
        data
    });
};