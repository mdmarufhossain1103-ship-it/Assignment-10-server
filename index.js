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
        const commentCollection = db.collection('comments');

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
            const { sessionId,
                priceID,
                userID,
                userName,
                userEmail,
                price,
                plan,
                purchaseDate, } = req.body;

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
                userName,
                userEmail,
                price,
                plan,
                purchaseDate,
            });

            await paymentCollection.insertOne({
                sessionId,
                priceID,
                userID,
                userName,
                userEmail,
                price,
                plan,
                purchaseDate: new Date(),
            })

            await userCollection.updateOne(
                { _id: new ObjectId(userID) },
                { $set: { plan } }
            );

            return res.json({ msg: "payment successful!" });
        });


        //search data


        app.get('/arts', async (req, res) => {
            try {
                const { email, search, minPrice,maxPrice,sort, page=1,limit=8} = req.query;

                let query = {};

                const skip = (Number(page) - 1) * Number(limit);

                if (email) {
                    query.email = email;
                }

                if (search) {
                    query.$or = [
                        {
                            title: {
                                $regex: search,
                                $options: "i"
                            }
                        },
                        {
                            artist: {
                                $regex: search,
                                $options: "i"
                            }
                        }
                    ];
                }


                if (minPrice || maxPrice) {
                    query.price = {};

                    if (minPrice) {
                        query.price.$gte = Number(minPrice);
                    }

                    if (maxPrice) {
                        query.price.$lte = Number(maxPrice);
                    }
                }

                let sortOption = { createdAt: -1 };

                if (sort === "priceLowHigh") {
                    sortOption = { price: 1 };
                }

                if (sort === "priceHighLow") {
                    sortOption = { price: -1 };
                }

                const result = await artCollection.find(query).skip(skip).limit(Number(limit)).sort(sortOption).toArray();
                const totalData = await artCollection.countDocuments(query)
                const totalPage = Math.ceil(totalData / Number(limit))
                res.send({ data: result, page: Number(page), totalPage });
            } catch (error) {
                res.status(500).send({
                    error: error.message
                });
            }
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

        //user comment section

        app.get('/comments/:ideaId', async (req, res) => {
            try {

                const ideaId = req.params.ideaId;

                const comments = await commentCollection
                    .find({ ideaId })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(comments);

            } catch (error) {
                res.status(500).send({
                    error: error.message
                });
            }
        });

        app.get('/comments', async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        error: 'Email is required'
                    });
                }
                const comments = await commentCollection.find({ email: email }).sort({ createdAt: -1 }).toArray();
                res.send(comments);
            }
            catch (error) {
                res.status(500).send({
                    error: error.message
                });
            }
        })

        app.post('/comments', async (req, res) => {
            try {

                const { ideaId, userName, text, email } = req.body;

                if (!ideaId || !userName || !text || !email) {
                    return res.status(400).send({
                        error: 'Missing required fields'
                    });
                }

                const newComment = {
                    ideaId,
                    userName,
                    text,
                    email,
                    createdAt: new Date(),
                    isEdited: false
                };

                const result = await commentCollection.insertOne(newComment);

                res.status(201).send({
                    _id: result.insertedId,
                    ...newComment
                });

            } catch (error) {
                res.status(500).send({
                    error: error.message
                });
            }
        });

        app.patch('/comments/:id', async (req, res) => {
            try {

                const id = req.params.id;
                const { text } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        error: 'Invalid ID'
                    });
                }

                const filter = {
                    _id: new ObjectId(id)
                };

                const updatedDoc = {
                    $set: {
                        text,
                        isEdited: true,
                        updatedAt: new Date()
                    }
                };

                const result = await commentCollection.updateOne(
                    filter,
                    updatedDoc
                );

                res.send(result);

            } catch (error) {
                res.status(500).send({
                    error: error.message
                });
            }
        });

        app.delete('/comments/:id', async (req, res) => {
            try {

                const id = req.params.id;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        error: 'Invalid ID'
                    });
                }

                const result = await commentCollection.deleteOne({
                    _id: new ObjectId(id)
                });

                res.send(result);

            } catch (error) {
                res.status(500).send({
                    error: error.message
                });
            }
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

        //Analytics
        app.get('/admin/analytics', async(req,res) =>{
            const users = await userCollection.find().toArray();
            const payments = await paymentCollection.find().toArray();
            const artist = await artCollection.find().toArray();

            const totalUsers = users.length;

            const totalArtist = users.filter((a) => a.role === 'artist').length;

            const totalWorkSold = payments.length;
            const totalRevenue = payments.reduce((sum,p) => sum + Number(p.price),0);

            res.send({totalUsers,totalArtist,totalWorkSold,totalRevenue})

        })

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