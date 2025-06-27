import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post('/api/generate-flashcards', async (req, res) => {
  try {
    const { notes } = req.body;
    
    if (!notes) {
      return res.status(400).json({ error: 'Notes are required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
    }

    const prompt = `Summarize the following notes and convert them into flashcards with a question and answer format. Respond as a JSON array like: [{"question": "...", "answer": "..."}]

Notes:

${notes}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes notes into flashcards. Always respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'OpenAI API request failed' 
      });
    }

    const data = await response.json();
    let flashcards = [];
    
    try {
      const content = data.choices[0].message.content.trim();
      // Remove any markdown code block formatting if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, '');
      flashcards = JSON.parse(cleanContent);
    } catch (parseError) {
      return res.status(500).json({ 
        error: 'Failed to parse AI response. Please try again.' 
      });
    }

    res.json({ flashcards });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});