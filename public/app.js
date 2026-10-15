// Build 3: a tiny bit of browser code that calls the server's /health endpoint.

const button = document.getElementById('ping');
const output = document.getElementById('health');

button.addEventListener('click', async () => {
  output.textContent = 'Checking...';
  try {
    const response = await fetch('/health');
    const data = await response.json();
    output.textContent = `HTTP ${response.status}\n${JSON.stringify(data, null, 2)}`;
  } catch (error) {
    output.textContent = `Request failed: ${error.message}`;
  }
});
