// Helper functions
const helpers = {
  // Format date helper
  formatDate: (date) => {
    return date.toLocaleDateString();
  },

  // Generate random string helper
  generateRandomString: (length) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Validate email helper
  validateEmail: (email) => {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }
};

module.exports = helpers;