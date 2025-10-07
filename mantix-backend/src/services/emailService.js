// Email service
const emailService = {
  // Send email method
  sendEmail: (to, subject, content) => {
    // Email sending logic will be implemented here
    console.log(`Sending email to: ${to} with subject: ${subject}`);
  },

  // Send notification email
  sendNotification: (to, notification) => {
    // Notification sending logic will be implemented here
    console.log(`Sending notification to: ${to}`);
  }
};

module.exports = emailService;