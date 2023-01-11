const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (err) {
    console.log(`Database Error is ${err}.`);
    process.exit(1);
  }
};
initializeDbServer();

//API 1 *Register*
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const checkUserQuery = `select username from user where username = '${username}';`;
  const checkUserResponse = await db.get(checkUserQuery);
  if (checkUserResponse === undefined) {
    const createUserQuery = `
      insert into user(username,name,password,gender) 
      values('${username}','${name}','${hashedPassword}','${gender}');`;
    if (password.length > 5) {
      const createUser = await db.run(createUserQuery);
      response.send("User created successfully"); //scenario 3
    } else {
      response.status(400);
      response.send("Password is too short"); //scenario 2
    }
  } else {
    response.status(400);
    response.send(`User already exists`); //scenario 1
  }
});
//API2 *Login*
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const loginUsername = `SELECT * FROM user WHERE username = '${username}';`;
  const loginResponse = await db.get(loginUsername);
  if (loginResponse !== undefined) {
    const validPassword = await bcrypt.compare(
      password,
      loginResponse.password
    );
    if (validPassword) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "IAmArmy");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});
//Authentication of JWT Token :- Define Middleware Function
const twitterAuthenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "IAmArmy", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3 Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get(
  "/user/tweets/feed/",
  twitterAuthenticationToken,
  async (request, response) => {
    const {
      order = "DESC",
      order_by = "date_time",
      limit = 4,
      search_q = "",
    } = request.query;
    const tweetsQuery = `SELECT  distinct username, tweet, date_time as dateTime FROM tweet INNER JOIN user ON tweet.user_id = user.user_id INNER JOIN follower ON user.user_id = follower.following_user_id
        ORDER BY  ${order_by} ${order} LIMIT ${limit};`;
    const getResponse = await db.all(tweetsQuery);
    response.send(getResponse);
  }
);
//API 4 Returns the list of all names of people whom the user follows
app.get(
  "/user/following/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { username } = request;
    const userObjectQuery = `SELECT user_id from user WHERE username = '${username}';`;
    const userObject = await db.get(userObjectQuery);
    const getFollowing = `SELECT  name FROM user INNER JOIN follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${userObject.user_id};`;
    const getResponse = await db.all(getFollowing);
    response.send(getResponse);
  }
);
//API 5 Returns the list of all names of people who follows the user
app.get(
  "/user/followers/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { username } = request;
    const userObjectQuery = `SELECT user_id from user WHERE username = '${username}';`;
    const userObject = await db.get(userObjectQuery);
    const getFollowers = `SELECT name FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id WHERE follower.following_user_id = ${userObject.user_id};'`;
    const getResponse = await db.all(getFollowers);
    response.send(getResponse);
  }
);
//API 6
app.get(
  "/tweets/:tweetId/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userObjectQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userObject = await db.get(userObjectQuery);
    const tweetsQuery = `SELECT 
   *
   FROM tweet
 
   WHERE tweet_id=${tweetId}
   `;

    const tweetResult = await db.get(tweetsQuery);
    const userFollowersQuery = `
    SELECT 
    *
   FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userObject.user_id};`;

    const userFollowers = await db.all(userFollowersQuery);

    // Checking whether the logged id user is following the tweeted user or not

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const getTweet = `SELECT tweet, count(like_id) as likes, count(reply) as replies, date_time as dateTime
        FROM tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id LEFT JOIN reply On tweet.tweet_id = reply.tweet_id 
        WHERE  tweet.tweet_id = ${tweetId};`;
      const getResponseTweet = await db.all(getTweet); //Scenario 2
      response.send(getResponseTweet);
    } else {
      response.status(401);
      response.send("Invalid request");
    }
  }
);
//API 7
app.get(
  "/tweets/:tweetId/likes/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userObjectQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userObject = await db.get(userObjectQuery);
    const tweetsQuery = `SELECT 
   *
   FROM tweet
 
   WHERE tweet_id=${tweetId}
   `;

    const tweetResult = await db.get(tweetsQuery);
    const userFollowersQuery = `
    SELECT 
    *
   FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userObject.user_id};`;

    const userFollowers = await db.all(userFollowersQuery);

    // Checking whether the logged id user is following the tweeted user or not

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const likesQuery = `
                SELECT 
                 *
                FROM like NATURAL JOIN user
                WHERE tweet_id=${tweetId}; 
                `;
      const result = await db.all(likesQuery);
      response.send({
        likes: result.map(({ name }) => name),
      });
    } else {
      response.status(401);
      response.send("Invalid request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userObjectQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userObject = await db.get(userObjectQuery);
    const tweetsQuery = `SELECT 
   *
   FROM tweet
 
   WHERE tweet_id=${tweetId}
   `;

    const tweetResult = await db.get(tweetsQuery);
    const userFollowersQuery = `
    SELECT 
    *
   FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userObject.user_id};`;

    const userFollowers = await db.all(userFollowersQuery);

    // Checking whether the logged id user is following the tweeted user or not

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const likesQuery = `
                SELECT 
                 name,reply
                FROM reply NATURAL JOIN user
                WHERE tweet_id=${tweetId}; 
                `;
      const result = await db.all(likesQuery);
      response.send({
        replies: result,
      });
    } else {
      response.status(401);
      response.send("Invalid request");
    }
  }
);
//API 9  Returns a list of all tweets of the user
app.get(
  "/user/tweets/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { username } = request;
    const userObjectQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userObject = await db.get(userObjectQuery);
    const getAllTweets = `SELECT tweet, count(like_id) as likes, count(reply) as replies, date_time as dateTime
    FROM user LEFT JOIN tweet ON user.user_id = tweet.user_id LEFT JOIN like ON tweet.tweet_id =
    like.like_id LEFT JOIN reply ON tweet.tweet_id = reply.reply_id`;
    const getResponse = await db.all(getAllTweets);
    response.send(getResponse);
  }
);
//API 10
app.post(
  "/user/tweets/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { tweet } = request.body;
    const createTweet = `INSERT INTO tweet(tweet) VALUES ('${tweet}');`;
    await db.run(createTweet);
    response.send("Created a Tweet");
  }
);
//API11
app.delete(
  "/tweets/:tweetId/",
  twitterAuthenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userObjectQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userObject = await db.get(userObjectQuery);
    const deleteUser = `SELECT * FROM user NATURAl JOIN tweet WHERE tweet_id = ${tweetId};`;
    const responseGet = await db.get(deleteUser);
    if (userObject.user_id === responseGet.user_id) {
      const deleteUserId = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      await db.run(deleteUserId);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
