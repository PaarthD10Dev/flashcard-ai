import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/ogg',
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-msvideo'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve flashcard viewer
app.get('/flashcard-viewer.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'flashcard-viewer.html'));
});

// Serve dashboard
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.post('/api/process-files', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files;
    const type = req.body.type;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    let extractedText = '';
    let processedCount = 0;

    for (const file of files) {
      try {
        let fileText = '';
        
        if (file.mimetype === 'application/pdf') {
          // PDF parsing temporarily disabled - will be implemented with alternative solution
          fileText = 'PDF processing is currently being updated. Please use text input for now.';
        } else if (file.mimetype === 'text/plain') {
          // Process text file
          fileText = fs.readFileSync(file.path, 'utf8');
        } else if (file.mimetype.startsWith('audio/')) {
          // For audio files, we'll need speech-to-text
          fileText = `[Audio file: ${file.originalname}] - Audio transcription would require additional speech-to-text service integration.`;
        } else if (file.mimetype.startsWith('video/')) {
          // For video files, we'll need video processing
          fileText = `[Video file: ${file.originalname}] - Video transcription would require additional video processing service integration.`;
        } else {
          fileText = `[Document: ${file.originalname}] - Document processing for this file type is not yet implemented.`;
        }
        
        extractedText += `\n\n--- Content from ${file.originalname} ---\n${fileText}`;
        processedCount++;
        
        // Clean up uploaded file
        fs.unlinkSync(file.path);
      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        // Clean up file even if processing failed
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up file:', unlinkError);
        }
      }
    }

    if (extractedText.trim() === '') {
      return res.status(400).json({ error: 'No text could be extracted from the uploaded files' });
    }

    res.json({
      message: `Successfully processed ${processedCount} file(s)`,
      extractedText: extractedText.trim()
    });

  } catch (error) {
    console.error('File processing error:', error);
    
    // Clean up any uploaded files in case of error
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up file:', unlinkError);
        }
      });
    }
    
    res.status(500).json({ error: 'File processing failed' });
  }
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
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