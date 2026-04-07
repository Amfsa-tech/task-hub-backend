/**
 * Escapes regex special characters in a string for safe use in MongoDB $regex queries.
 * Prevents ReDoS and unintended pattern matching from user input.
 */
export const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
