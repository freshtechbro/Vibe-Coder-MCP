// Quick test to see what free models return
const apiKey = "";

async function testFreeModel() {
  const requestPayload = {
    model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
    messages: [
      { role: "system", content: "Respond with a simple greeting." },
      { role: "user", content: "Hello" }
    ],
    max_tokens: 50,
    temperature: 0.1
  };

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://vibe-coder-mcp.local"
      },
      body: JSON.stringify(requestPayload)
    });

    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response structure:');
    console.log(JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}

testFreeModel();
