export function apiErrorMessage(error, fallback) {
  const status = error.response?.status;
  const statusMessages = {
    401: "Your session has expired. Sign in again to continue.",
    403: "You do not have permission to do that.",
    404: "The requested resume information could not be found.",
    413: "The PDF is too large. Choose a file no larger than 5 MB.",
    422: "The PDF could not be read. Choose a text-based, readable PDF.",
    500: "HireHub could not complete the request. Please try again.",
  };
  return statusMessages[status] || error.response?.data?.message || fallback;
}
