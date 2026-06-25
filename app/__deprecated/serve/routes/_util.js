/**
 * @param {string} value
 */
export const parseParamValue = (value) => {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  if (numberRegex.test(value)) return parseFloat(value);
  return value;
};

const numberRegex = /^-?\d*\.?\d+$/;
