const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongo = require('mongodb');
const mongoose = require('mongoose');
const uuid = require('uuid');

const app = express();
require('dotenv').config();

// basic config
const port = process.env.PORT || 3000;
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());

// connection mongo
const uri = process.env.MONGO_URI;
mongoose.connect(uri, {
  'useNewUrlParser': true,
  'useUnifiedTopology': true,
  'serverSelectionTimeoutMS': 5000,
});
const connection = mongoose.connection;
connection.on('error', console.error.bind(console, 'connection error'));
connection.once('open', () => { console.log("MongoDB database connection established successfully"); });

// model user
const Schema = mongoose.Schema;
const userSchema = new Schema({
  _id: String,
  username: String,
});
const USER = mongoose.model("USER", userSchema);

// model exercise
const exerciseSchema = new Schema({
  _id: String,
  user_id: String,
  description: String,
  duration: Number,
  date: Number,
});
const EXERCISE = mongoose.model("EXERCISE", exerciseSchema);

// init route
app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

function utcStringToFormatCustom (dateStr = '')
{
  if(dateStr != '') {
    let dateStrValues1 = dateStr.split(', ');
    let dateStrValues2 = dateStrValues1[1].split(' ');
    let dateStrValues = `${dateStrValues1[0]} ${dateStrValues2[1]} ${dateStrValues2[0]} ${dateStrValues2[2]}`;
    return dateStrValues;
  }
}

function getDateNow (date = '') 
{
  let today = (date == '') ? new Date(): new Date(date);
  let year = today.getFullYear();
  let month = ((today.getMonth() + 1) < 10) ? `0${today.getMonth() + 1}` : today.getMonth() + 1;
  let day = (today.getDate() < 10) ? `0${today.getDate()}` : today.getDate();
  var date = `${year}-${month}-${day}`;
  return date;
}

// POST /api/users
app.post('/api/users', async (req, res) => {

  const username = req.body.username;
  const _id = uuid.v1();

  if (username == "") {
    res.status(400).send('Path `username` is required.')
  } else {
    try {
      let findOne = await USER.findOne({
        username: username
      });
      if(findOne) {
        res.json({
          _id: findOne._id,
          username: findOne.username
        });
      } else {
        findOne = new USER({
          _id: _id,
          username: username
        });
        await findOne.save();
        res.json({
          _id: findOne._id,
          username: findOne.username
        });
      }
    } catch (err) {
      console.log(err);
      res.status(500).json('Server error');
    }
  }
});

// POST /api/users/:_id/exercises
app.post('/api/users/:_id/exercises', async (req, res) => {

  const user_id = req.params._id;
  // return res.json(req.body);
  
  if (user_id == "") {
    res.status(400).send('not found')
  } else {

    // let nowDate = new Date()
    // nowDate = nowDate.toISOString().split('T')[0];

    let description = req.body.description || '';
    let duration = req.body.duration || '';
    let date = req.body.date || getDateNow();
    let dateUnix = null;
    let dateStr = null;
    let _id = uuid.v1();

    if (!isNaN(Date.parse(date))) {
      let dateString = new Date(date);
      dateUnix = dateString.valueOf();
      dateStr = utcStringToFormatCustom(dateString.toUTCString());
    } else {
      return res.status(400).send('Cast to date failed for value "' + date + '" at path "date"');
    }

    if (duration == '' && duration != 0) {
      return res.status(400).send("Path `duration` is required.");
    }
    if (description == '') {
      return res.status(400).send("Path `description` is required.");
    }
    if (duration < 1) {
      return res.status(400).send("duration too short");
    }

    try {
      // find user
      let user = await USER.findOne({ _id: user_id });
      if (!user) {
        return res.status(400).send("Unknown userId");
      } else {
        let exercise = await EXERCISE.findOne({
          description: description
        });
        if (!exercise) {
          exercise = new EXERCISE({
            _id: _id,
            description: description,
            duration: duration,
            date: dateUnix,
            user_id: user_id
          });
          console.log({
            _id: _id,
            description: description,
            duration: duration,
            date: dateUnix,
            user_id: user_id
          });
          await exercise.save();
          return res.json({
            _id: user._id,
            username: user.username,
            date: dateStr,
            duration: exercise.duration,
            description: exercise.description
          });
        } else {
          return res.json({
            _id: user._id,
            username: user.username,
            date: utcStringToFormatCustom(new Date(exercise.date).toUTCString()),
            duration: exercise.duration,
            description: exercise.description
          });
        }
      }
    } catch (err) {
      console.log(err);
      res.status(500).json('Server error');
    }
  }
});

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    let exercises = await USER.find();
    res.json(exercises);
  } catch (err) {
    console.log(err);
    res.status(500).json('Server error');
  }
});

// GET /api/users/:_id/logs?[from][&to][&limit]
app.get('/api/users/:id/logs', async (req, res) => {

  const user_id = req.params.id;
  const limit = req.query.limit || '';
  
  let dateString = null;
  let from = req.query.from || '';
  if (from != '') {
    from = new Date(from);
    from = from.valueOf();
  }
  let to = req.query.to || '';
  if (to != '') {
    to = new Date(to);
    to = to.valueOf();
  }
  
  if (user_id == "") {
    res.status(400).send('not found')
  } else {
    try {
      // find user
      let user = await USER.findOne({ _id: user_id });
      console.log(user);
      if (!user) {
        return res.status(400).send("Unknown userId");
      } else {
        let exercises = await EXERCISE.find({ user_id: user_id }).limit(limit);

        let exercisesCleared = [];
        for (let index = 0; index < exercises.length; index++) {
          const exercise = exercises[index];

          let addToArray = false;
          if(from == '' && to == '') {
            addToArray = true;
          } else if(from != '' && to != '') {
            if(from <= exercise.date && to >= exercise.date) {
              addToArray = true;
            }
          } else if(from != '' && to == '') {
            if(from <= exercise.date) {
              addToArray = true;
            }
          } else if(from == '' && to != '') {
            if(to >= exercise.date) {
              addToArray = true;
            }
          }

          if(addToArray) {
            exercisesCleared.push({
              // _id: exercise._id,
              description: exercise.description,
              duration: exercise.duration,
              date: utcStringToFormatCustom(new Date(exercise.date).toUTCString())
            });
          }
        }

        res.json({
          _id: user._id,
          username: user.username,
          count: exercisesCleared.length,
          log: exercisesCleared
        });
      }
    } catch (err) {
      console.log(err);
      res.status(500).json('Server error');
    }
  }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
