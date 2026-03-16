const axios = require('axios');
require('dotenv').config();

async function test() {
  try {
    const response = await axios.post(
        'https://api.replicate.com/v1/models/meta/meta-llama-3-70b-instruct/predictions',
        {
            stream: true,
            input: {
                prompt: "Hello, World!",
                max_new_tokens: 8192,
                temperature: 0.7,
            },
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );
    console.log("Prediction started:", response.data.id);
    const streamUrl = response.data.urls.stream;
    
    const streamResponse = await axios.get(streamUrl, {
        headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-store',
        },
        responseType: 'stream',
    });
    
    await new Promise((resolve) => {
        streamResponse.data.on('data', (chunk) => {
            console.log("CHUNK:", chunk.toString());
        });
        streamResponse.data.on('end', () => {
            console.log("END");
            resolve();
        });
    });
    
  } catch (e) {
    console.error("Error:", e.response?.data || e.message);
  }
}
test();
