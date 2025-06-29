// Quick test to see what free models return
const apiKey = "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";

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
