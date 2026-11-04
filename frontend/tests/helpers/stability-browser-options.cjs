// Use Playwright's installed Chromium unless the developer explicitly selects a browser.
module.exports = function browserOptions(env = process.env) {
  const executablePath = env.BROWSER_PATH?.trim();
  return { headless: true, ...(executablePath ? { executablePath } : {}) };
};
