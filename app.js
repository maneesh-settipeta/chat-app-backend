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
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ["GET", "POST",]
    },
});


const connection = new Client({
    host: process.env.DB_HOSTNAME,
    user: process.env.DB_USERNAME,
    port: process.env.DB_PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
})

connection.connect((err) => {
    if (err) {
        console.log(err);
        throw err
    }
    console.log(port + "Connected Backend" + process.env.DB_PORT)
});



io.on("connection", (socket) => {
    console.log("Connected to Socket", socket.id);

    socket.on("joinChat", (user_uuid) => {
        console.log(`${user_uuid} Joined 46`);
        socket.join(user_uuid);
    });

    socket.on('sendMessage', async (data) => {
        const { logged_in_user_uuid, receiver_uuid, message } = data;
        console.log(logged_in_user_uuid, receiver_uuid, message, "Received data from client");
        try {
            const query = "INSERT INTO messages (logged_in_user_uuid, receiver_uuid, message) VALUES($1,$2,$3) RETURNING *";
            const values = [logged_in_user_uuid, receiver_uuid, message]
            const saveMessage = await connection.query(query, values);
            console.log(saveMessage.rows[0]);
            io.to(receiver_uuid).emit('receiveMessage', { logged_in_user_uuid, message });
            io.to(logged_in_user_uuid).emit('receiveMessage', { logged_in_user_uuid, message });
        } catch (error) {
            console.error('Error saving message to the database:', error);
        }
    });
    socket.on("disconnect", () => {
        console.log("User disconnected", socket.id);
    });
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
            res.status(202).json({msg:"valid", data:userDetails});
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