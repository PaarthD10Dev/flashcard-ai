import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/generate-flashcards', async (req, res) => {
  try {
    const { notes } = req.body;
    
    if (!notes) {
      return res.status(400).json({ error: 'Notes are required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured on server' });
    }

    const prompt = `Summarize the following notes and convert them into flashcards with a question and answer format. Respond ONLY with a valid JSON array in this exact format: [{"question": "...", "answer": "..."}]

Notes:

${notes}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'Gemini API request failed' 
      });
    }

    const data = await response.json();
    let flashcards = [];
    
    try {
      const content = data.candidates[0].content.parts[0].text.trim();
      // Remove any markdown code block formatting if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, '');
      flashcards = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Parse error:', parseError);
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