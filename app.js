require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { Client } = require('pg');
const bcrypt = require('bcrypt')
const app = express();
app.use(cors());
app.use(express.json());


const port = 3000;
const http = require('http');
const { log, error } = require('console');
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.origin,
        methods: ["GET", "POST",]
    },
});


const connection = new Client({
    connectionString: process.env.DATABASE_URL
    // host: process.env.DB_HOSTNAME,
    // user: process.env.DB_USERNAME,
    // port: process.env.DB_PORT,
    // password: process.env.DB_PASSWORD,
    // database: process.env.DB_NAME,
    // ssl: process.env.ssl
})

connection.connect((err) => {
    if (err) {
        console.log(err);
        // throw err
        console.error(err)
    }
    console.log(port + "Connected Backend" + process.env.DB_PORT)
});



io.on("connection", (socket) => {
    console.log("Connected to Socket", socket.id);
    socket.on("joinChat", (receiver_uuid, logged_in_user_uuid) => {
        const sortedUsersId = [receiver_uuid, logged_in_user_uuid].sort().join("_")
        console.log(`${receiver_uuid} and  ${logged_in_user_uuid} Joined in ${sortedUsersId}`);
        socket.join(sortedUsersId);

    });
    socket.on('sendMessage', async (data) => {
        const { logged_in_user_uuid, receiver_uuid, message } = data;
        const sortedusersids = [receiver_uuid, logged_in_user_uuid].sort().join("_");

        try {
            const query = "INSERT INTO messages (logged_in_user_uuid, receiver_uuid, message, sortedUsersIds) VALUES($1,$2,$3,$4) RETURNING *";
            const values = [logged_in_user_uuid, receiver_uuid, message, sortedusersids]
            const saveMessage = await connection.query(query, values);
            console.log(saveMessage.rows[0]);
            io.to(sortedusersids).emit('receiveMessage', { logged_in_user_uuid, receiver_uuid, message, sortedusersids });
        } catch (error) {
            console.error('Error saving message to the database:', error);
        };
    });
    socket.on("disconnect", () => {
        console.log("User disconnected", socket.id);
    });
})


app.post('/getMessages', async (req, res) => {
    const { sorteduseruuids } = req.body;
    console.log(sorteduseruuids, "THIS IS SORTED");

    try {
        const query = 'SELECT * FROM messages WHERE sortedusersids=$1';
        const values = [sorteduseruuids];
        const getMessage = await connection.query(query, values);
        res.status(201).json({ data: getMessage.rows });
        console.log(getMessage.rows);
    } catch (error) {
        console.error(error, "Error while fetching");
        res.status(501).json({ msg: "Error while getting messages" });
    }
})


app.post('/createSignUp', async (req, res) => {
    try {
        const createQuery = `CREATE TABLE IF NOT EXISTS public.users
            (
            user_uuid text NOT NULL,
            first_name text NOT NULL,
            last_name text NOT NULL,
            password text NOT NULL,
            email text NOT NULL
            )`;

        await connection.query(createQuery);

        res.status(200).json({ msg: "Table created" });
    } catch (error) {
        console.log(error, "Error While fetching");
        res.status(500).json({ msg: "Table created" + error });
    }
})
app.get("/", async (req, res) => {
    res.json({
        msg: "Getting"
    })
})

app.get('/getUsers', async (req, res) => {

    try {

        const getUsersQuery = 'SELECT * FROM users';
        const getUsers = await connection.query(getUsersQuery);
        res.json({ data: getUsers.rows });
    } catch (error) {
        console.error("Error while fetching", error);
    }
})

app.post('/login', async (req, res) => {
    const { email, userpassword } = req.body;
    console.log(email, userpassword);

    try {
        const query = 'SELECT * from users WHERE email=$1';
        const values = [email];
        const checkIsUserThere = await connection.query(query, values);
        console.log(checkIsUserThere);

        const userDetails = checkIsUserThere.rows[0];
        if (checkIsUserThere.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
        }
        const hashedPassword = userDetails.password
        const checkPassword = await bcrypt.compare(userpassword, hashedPassword);
        if (checkPassword) {
            res.status(202).json({ msg: "valid", data: userDetails });
        }
        else {
            res.status(401).json({ msg: "Unauthorized" });
        }
    } catch (error) {
        console.error("Error Creating User", error);
        res.status(500).send({
            msg: 'Error checking user',
            error: error
        });
    }
});


app.post('/signUp', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    const CheckQuery = 'SELECT * FROM users WHERE email =$1';
    const values = [email]
    const checkIfUserEmailExists = await connection.query(CheckQuery, values);
    if (checkIfUserEmailExists.rows.length !== 0) {
        console.log("getting in 142");
        return res.status(409).json({ msg: "User Already Exists" });
    }
    const useruuid = uuidv4();
    try {
        const saltRounds = 10;
        const hashPassword = await bcrypt.hash(password, saltRounds);
        const query = 'INSERT INTO users (first_name, last_name, email, password, user_uuid) VALUES ($1,$2,$3,$4,$5)';
        const values = [firstName, lastName, email, hashPassword, useruuid];
        await connection.query(query, values);
        res.status(201).json({ msg: "User Created Successfully" });
    } catch (error) {
        console.error("Error Creating User", error);
    }
});


server.listen(port);