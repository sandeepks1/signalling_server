const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

let db;

const mongoURI = 'mongodb+srv://sandeepks1:sandeepks1@cluster0.qzhhdxu.mongodb.net/?retryWrites=true&w=majority';

MongoClient.connect(mongoURI)
  .then((client) => {
    db = client.db('device_detail'); // Change to your database name
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// Create a new collection only if it doesn't exist
app.post('/createCollection', async (req, res) => {
  try {
    const { device_id } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    // Check if the collection already exists
    const collections = await db.listCollections({ name: device_id }).toArray();

    if (collections.length === 0) {
      // The collection doesn't exist, so create it
      db.createCollection(device_id);

      // Create an empty document with 'offersdp' and 'answersdp' fields
      const collection = db.collection(device_id);
      const emptyData = { offersdp: '', answersdp: '', status: '' };
      await collection.insertOne(emptyData);

      res.json({ message: 'Collection created successfully', device_id });
      console.log("New device and empty data created");
    } else {
      res.json({ message: 'Collection already exists', device_id });
      console.log("Collection exists");
    }
  } catch (err) {
    console.error('Error creating or checking collection:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update the offer and status based on device_id
app.post('/createOffer', async (req, res) => {
  try {
    const { device_id, offersdp, status } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const collection = db.collection(device_id);

    // Update the offer and status fields within the collection
    const result = await collection.updateOne(
      {},
      { $set: { offersdp, status } }
    );

    res.json({ message: 'Offer and status updated successfully', data: result });
  } catch (err) {
    console.error('Error updating offer and status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new route to update answersdp and status based on device_id
app.post('/createAnswerSDP', async (req, res) => {
  try {
    const { device_id, answersdp, status } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const collection = db.collection(device_id);

    // Update the answersdp and status fields within the collection
    const result = await collection.updateOne(
      {},
      { $set: { answersdp, status } }
    );

    res.json({ message: 'Answer SDP and status updated successfully', data: result });
  } catch (err) {
    console.error('Error updating answer SDP and status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get the 'offersdp' value based on device_id
app.get('/getClientOffer', async (req, res) => {
  try {
    const { device_id } = req.query;

    if (!device_id) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const collection = db.collection(device_id);
    const offerDocument = await collection.findOne();

    if (!offerDocument || !offerDocument.offersdp) {
      return res.status(404).json({ error: 'Offer SDP not found' });
    }

    res.json({ offersdp: offerDocument.offersdp });
  } catch (err) {
    console.error('Error getting client offer SDP:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/getClientAnswer', async (req, res) => {
    try {
      const { device_id } = req.query;
  
      if (!device_id) {
        return res.status(400).json({ error: 'Device ID is required' });
      }
  
      const collection = db.collection(device_id);
      const offerDocument = await collection.findOne();
  
      if (!offerDocument || !offerDocument.answersdp) {
        return res.status(404).json({ error: 'Answer SDP not found' });
      }
  
      res.json({ answersdp: offerDocument.answersdp });
    } catch (err) {
      console.error('Error getting client offer SDP:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/getStatus', async (req, res) => {
    try {
      const { device_id } = req.query;
  
      if (!device_id) {
        return res.status(400).json({ error: 'Device ID is required' });
      }
  
      const collection = db.collection(device_id);
      const offerDocument = await collection.findOne();
  
      if (!offerDocument || !offerDocument.status) {
        return res.status(404).json({ error: 'Answer SDP not found' });
      }
  
      res.json({ status: offerDocument.status });
    } catch (err) {
      console.error('Error getting client offer SDP:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
