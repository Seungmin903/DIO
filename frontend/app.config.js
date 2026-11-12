const { expo } = require('./app.json');

// EAS resolves GOOGLE_SERVICES_JSON to the uploaded secret file's temporary
// path. Local development retains the project-relative fallback in app.json.
module.exports = () => ({
  ...expo,
  android: {
    ...expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? expo.android.googleServicesFile,
  },
});
