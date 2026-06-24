const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const PORT = process.env.PORT;

const uri = process.env.MONGODB_URI;
const CLIENT_URL = process.env.CLIENT_URL;

app.use(
    cors({
        credentials: true,
        origin: [CLIENT_URL],
    })
);

app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

// JWKS
const JWKS = createRemoteJWKSet(
    new URL(`${CLIENT_URL}/api/auth/jwks`)
);

// =======================
// AUTH MIDDLEWARE
// =======================
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ msg: "unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ msg: "unauthorized" });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    } catch (error) {
        console.log(error);
        return res.status(401).json({ msg: "unauthorized" });
    }
};

// =======================
// SELLER CHECK (FIXED)
// =======================
const verifySeller = async (req, res, next) => {
    try {
        const user = await userCollection.findOne({
            email: req.user.email,
        });

        if (!user || user.role !== "seller" || user.plan !== "pro") {
            return res.status(403).json({ msg: "forbidden" });
        }

        req.dbUser = user;
        next();
    } catch (err) {
        return res.status(500).json({ msg: "server error" });
    }
};

// =======================
// DATABASE
// =======================
async function run() {
    try {
        await client.connect();

        const db = client.db("ArtHub");

        const artCollection = db.collection("arts");
        const subcriptionCollection = db.collection("subcriptions");
        const userCollection = db.collection("user");
        const paymentCollection = db.collection("payments");

        // make accessible in middleware
        global.userCollection = userCollection;

        // =======================
        // ARTWORKS (PUBLIC)
        // =======================
        app.get("/artworks", async (req, res) => {
            const result = await artCollection
                .find()
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });

        app.get("/artworks/:id", async (req, res) => {
            const { id } = req.params;

            const result = await artCollection.findOne({
                _id: new ObjectId(id),
            });

            res.send(result);
        });

        // =======================
        // SUBSCRIPTION
        // =======================
        app.post("/subcription", async (req, res) => {
            const { sessionId, priceID, userID } = req.body;

            const isExist = await subcriptionCollection.findOne({
                sessionId,
            });

            if (isExist) {
                return res.json({ msg: "Already exist!" });
            }

            await subcriptionCollection.insertOne({
                sessionId,
                priceID,
                userID,
            });

            await userCollection.updateOne(
                { _id: new ObjectId(userID) },
                { $set: { plan: "pro" } }
            );

            return res.json({ msg: "payment successful!" });
        });

        // =======================
        // PAYMENT
        // =======================
        app.post("/payment", async (req, res) => {
            const {
                sessionId,
                productId,
                userID,
                userName,
                userEmail,
                paymentType,
                title,
                price,
                artist,
                image,
                purchaseDate,
            } = req.body;

            const isExist = await paymentCollection.findOne({
                sessionId,
            });

            if (isExist) {
                return res.json({ msg: "Already exist!" });
            }

            await paymentCollection.insertOne({
                sessionId,
                productId,
                userID,
                userName,
                userEmail,
                paymentType,
                title,
                price,
                artist,
                image,
                purchaseDate,
            });

            return res.json({ msg: "payment successful!" });
        });

        app.get("/payment", async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        });

        // =======================
        // USER PROFILE UPDATE
        // =======================
        app.patch("/user/:id", async (req, res) => {
            const { id } = req.params;
            const { name, email } = req.body;

            const result = await userCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        name,
                        email,
                    },
                }
            );

            res.send(result);
        });

        // =======================
        // ARTIST ROUTES (FIXED)
        // =======================

        app.post(
            "/artist/arts",
            async (req, res) => {
                const data = req.body;

                const result = await artCollection.insertOne({
                    ...data,
                    createdAt: new Date(),
                });

                res.send(result);
            }
        );

        app.get(
            "/artist/artworks",
            async (req, res) => {
                const result = await artCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .toArray();


                res.send(result);
            }
        );

        app.delete(
            "/artist/artworks/:id",
            async (req, res) => {
                const { id } = req.params;
                const result = await artCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.send(result);
            }
        );

        app.patch(
            "/artist/artworks/:id",
            async (req, res) => {
                const { id } = req.params;
                const { title, price } = req.body;

                const result = await artCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            title,
                            price,
                        },
                    }
                );

                res.send(result);
            }
        );

        //admin

        //user
        app.get('/users', async(req,res) =>{
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        //role change
        app.patch('/user/role/:id', async(req,res) => {
          const {id} = req.params;
          const {role} = req.body;
          const result = await userCollection.updateOne(
            {_id: new ObjectId(id)},
            {
                $set:{
                    role,
                }
            }
          )
          
          res.send(result);
        })

        //all artwork
        app.get(
            "/all/artworks",
            async (req, res) => {
                const result = await artCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .toArray();


                res.send(result);
            }
        );

        //all payment
        app.get("/admin/payment", async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        });

        // =======================
        // HEALTH CHECK
        // =======================
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connected successfully!");
    } finally {
        // keep connection alive
    }
}

run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Server is running fine!");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});