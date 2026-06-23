const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
dontenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(
    cors({
        credentials: true,
        origin: [process.env.CLIENT_URL],
    }),
);
app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer")) {
        return res.status(401).json({ msg: "unathorized" })
    }

    const token = authHeader.split(" ")[1]

    if (!token) {
        return res.status(401).json({ msg: "unathorized" })
    }

    try {

        const { payload } = await jwtVerify(token, JWKS)
        req.user = payload
        next();

    } catch (error) {
        console.log(error)
        return res.status(401).json({ msg: "unathorized" })
    }
}

const varifySeller = async (req, res, next) => {
    const user = req.user;
    if (user.role !== 'seller' || user.plan !== 'pro') {
        return res.status(403).json({ msg: "forbidden" })
    }
    next();
}

async function run() {
    try {
        await client.connect();
        const db = client.db("ArtHub");
        const artCollection = db.collection('arts')
        const subcriptionCollection = db.collection('subcriptions')
        const userCollection = db.collection('user')
        const paymentCollection = db.collection('payments')


        //art
        app.get('/artworks', async(req,res) =>{
            const result = await artCollection.find().toArray();
            res.send(result);
        })

        app.get('/artworks/:id', async(req,res) =>{
            const {id} = req.params;
            const result = await artCollection.findOne({_id: new ObjectId(id)})
            res.send(result)
        })

        //Subcription
        app.post('/subcription', async (req, res) => {
            const { sessionId, priceID, userID } = req.body

            const isExit = await subcriptionCollection.findOne({ sessionId })

            if (isExit) {
                return res.json({ msg: "Already exist!" })
            }
            await subcriptionCollection.insertOne({
                sessionId,
                priceID,
                userID
            })

            await userCollection.updateOne(
                { _id: new ObjectId(userID) },
                { $set: { plan: "pro" } },
            )

            return res.json({ msg: "payment successful!" })
        })

        //payment

        app.post('/payment', async (req, res) => {
            const { sessionId, productId, userID, title, price, artist, image, purchaseDate } = req.body
            console.log(image)

            const isExit = await paymentCollection.findOne({ sessionId })

            if (isExit) {
                return res.json({ msg: "Already exist!" })
            }
            await paymentCollection.insertOne({
                sessionId,
                productId,
                userID,
                title,       
                price, 
                artist,
                image,
                purchaseDate
            });

            return res.json({ msg: "payment successful!" })
        })

        //show payment
        app.get('/payment', async(req,res) =>{
            const result = await paymentCollection.find().toArray();
            res.send(result);
        })

        //user update profile
        app.patch('/user/:id', async(req,res) =>{
            const {id} = req.params;
            const {name,email} = req.body;

            const result = await userCollection.updateOne({
                _id: new ObjectId(id)
            },
            {
                $set: {
                    name,
                    email,
                }
            }
        )
        res.send(result);
        })


        //artist information

        //add data
        app.post('/artist/arts', async (req, res) => {
            const data = req.body
            const result = await artCollection.insertOne({ ...data, createdAt: new Date() })
            res.send(result)
        })

        //show add data
        app.get('/artist/artworks', async (req, res) => {
            const result = await artCollection.find().toArray();
            res.send(result);
        })


        await client.db("admin").command({ ping: 1 });
        console.log(
            "Pinged your deployment. You successfully connected to MongoDB!",
        );
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Server is running fine!");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
