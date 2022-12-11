//jshint esversion:6

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const { request, response } = require("express");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const findOrCreate = require("mongoose-findorcreate");
const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const validator = require("email-validator");


const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://user1:user1@cluster0.wx9tbnk.mongodb.net/LaMirage?retryWrites=true&w=majority").then(res => {

})

const userSchema = new mongoose.Schema({
  name: String,
  phone: {
    type: Number,
  },
  username: {
    type: String,
    unique: true,
  },
  password: String,
  googleId: String,
  microsoftId: String,
  secret: String,
  isAdmin: Boolean
});

const RoomSchema = new mongoose.Schema({
  room_id: String,
  type: String,
  rentPerDay: Number,
});

const BookingSchema = new mongoose.Schema({
  userid: mongoose.Schema.Types.ObjectId,
  room_id: Array,
  amount: Number,
  type: String,
  check_in_date: Date,
  check_out_date: Date,
  check_in_time: String,
  no_of_person: Number
});

const EmployeeSchema = new mongoose.Schema({
  name: String,
  salary: Number,
  work: String,
  dateOfJoin: Date,
  phone: Number
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User", userSchema);
const Room = mongoose.model("Room", RoomSchema);
const Book = mongoose.model("Book", BookingSchema);
const Employee = mongoose.model("Employee", EmployeeSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, cb) {
  process.nextTick(function () {
    cb(null, { id: user.id, username: user.username });
  });
});

passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});

passport.use(new GoogleStrategy({
  clientID: process.env.GCLIENT_ID,
  clientSecret: process.env.GCLIENT_SECRET,
  callbackURL: process.env.HOSTING_PORT + "/auth/google/login"
},
  function (accessToken, refreshToken, profile, cb) {
    console.log(profile)
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new MicrosoftStrategy({
  // Standard OAuth2 options
  clientID: process.env.MCLIENT_ID,
  clientSecret: process.env.MCLIENT_SECRET,
  callbackURL: process.env.HOSTING_PORT + "/auth/microsoft/login",
  scope: ['user.read'],
},
  function (accessToken, refreshToken, profile, done) {
    console.log(profile)
    User.findOrCreate({ microsoftId: profile.id }, function (err, user) {
      return done(err, user);
    });
  }
));

const renderBooking = (req, res, next) => {
  const uid = req.user.id
  const bookedRooms = req.bookedRooms;

  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        if ([...bookedRooms].length !== 0) {
          res.render("admin/viewbooking.ejs", { bookedRooms: bookedRooms, msg: "The Bookings are : " })
        }
        else {
          res.render("admin/viewbooking.ejs", { bookedRooms: [], msg: "No Bookings available..." })
        }
      }
    }
  })
}

const renderProfile = (req, res, next) => {
  if (req.isAuthenticated()) {
    const id = req.user.id
    const errMsg = req.errMsg
    User.findById(id, (err, user) => {
      if (err) {
        console.log(err)
      }
      else {
        Item = {
          name: user.name,
          username: user.username,
          phone: user.phone
        }
        if (req.isAuthenticated()) {
          res.render("client/profile.ejs", { details: Item, response: errMsg.msg })
        }
        else {
          res.redirect("/signin")
        }
      }
    })
  }
  else {
    res.redirect("/signin")
  }
}

const viewBooking = async (req, res, next) => {
  const date = new Date(req.body.date);
  try {
    const response = await Book.aggregate([
      {
        $match: { check_in_date: date }
      },
      {
        $lookup: {
          from: "users",
          localField: "userid",
          foreignField: "_id",
          as: "userDetails"
        }
      },

      {
        $project: {
          "userDetails._id": 0,
          "userDetails.salt": 0,
          "userDetails.hash": 0,
          "userDetails.isAdmin": 0
        }
      }
    ])
    req.bookedRooms = [...response]
    next();
  } catch (err) {

  }
}

const updatePhone = (req, res, next) => {
  const phone = req.body.phone
  const userid = req.user.id
  req.errMsg = { msg: "" }
  User.findByIdAndUpdate(userid, { phone: phone }, (err, foundList) => {
    if (err) {
      req.errMsg = { ...req.errMsg, msg: err }
      return next();
    }
    else {
      req.errMsg = { ...req.errMsg, msg: "Phone number updated successfully" }
      return next();
    }
  })
}

const updatePwd = (req, res, next) => {
  const userid = req.user.id
  req.errMsg = { msg: "" }
  return User.findOne({ _id: userid }, (err, user) => {
    if (err) {
      req.errMsg = { ...req.errMsg, msg: err }
      return next();
    }
    else {
      if (!user) {
        req.errMsg = { ...req.errMsg, msg: "User not found" }
        return next();
      }
      else {
        user.changePassword(req.body.oldpassword, req.body.newpassword, function (err) {
          if (err) {
            if (err.name === 'IncorrectPasswordError') {
              req.errMsg = { ...req.errMsg, msg: "Incorrect Old Password" }
            }
            else {
              req.errMsg = { ...req.errMsg, msg: "Something went wrong!! Please try again after sometimes." }
            }
            return next();
          }
          else {
            req.errMsg = { ...req.errMsg, msg: "Your password has been changed successfully" }
            return next();
          }
        })
      }
    }
  });
}

app.get("/signin", (req, res, next) => {
  res.render("common/signin.ejs")
})

app.get("/signup", (req, res, next) => {
  res.render("common/signup.ejs")
})

app.get("/auth/google",
  passport.authenticate('google', { scope: ["profile"] })
);

app.get("/auth/google/login",
  passport.authenticate('google', { failureRedirect: '/signin' }),
  function (req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect('/home');
  });

app.get('/auth/microsoft',
  passport.authenticate('microsoft', { prompt: 'select_account', })
);

app.get('/auth/microsoft/login',
  passport.authenticate('microsoft', { failureRedirect: '/signin' }),
  function (req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect('/home');
  });

app.post("/signin", (req, res, next) => {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });
  User.findOne({ username: req.body.username }, (err, user1) => {
    if (!user1) {
      res.redirect("/re-signin");
    }
    else if (user1.isAdmin == true) {
      req.login(user, (err) => {
        if (err) {
          console.log(err);
        }
        else {
          passport.authenticate("local", { failureRedirect: "/re-signin" })(req, res, next => {
            res.redirect("/admin-home");
          })
        }
      });
    }
    else {
      req.login(user, (err) => {
        if (err) {
          console.log(err);
        }
        else {
          passport.authenticate("local", { failureRedirect: "/re-signin" })(req, res, next => {
            res.redirect("/home");
          })
        }
      });
    }
  });
});

app.post("/signup", (req, res) => {
  const newUser = new User({
    name: req.body.name,
    username: req.body.username,
    phone: req.body.phone,
    isAdmin: false
  })

  User.register(newUser, req.body.password, (err, user) => {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    }
    else {
      passport.authenticate("local")(req, res, next => {
        res.redirect("/home");
      });
    }
  });
});

app.get("/re-signin", (req, res, next) => {
  res.render("common/re_signin.ejs")
})

app.get("/forget-password", (req, res, next) => {
  res.render("common/reset_username.ejs")
})

app.post("/forget-password", (req, res) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.USERNAME_O.toString(),
      pass: process.env.PASSWORD.toString(),
    },
  });
  var mailOptions = {
    from: process.env.USERNAME_O,
    to: req.body.username,
    subject: 'Reset password',
    html: `<p>Click the button to reset the Password</p><br><form action="${process.env.HOSTING_PORT}/type-password" method="POST"><input type="hidden" name="email" value="${req.body.username}" id="email"/><button type="submit">Reset Password</button></form>`
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error)
      throw Error(error);
    else {
      console.log('Email Sent Successfully');
      res.render("common/email_send.ejs")
    }
  });
})

app.post("/type-password", (req, res, next) => {
  const username = req.body.email;
  res.render("common/reset_password.ejs", { username: username })
})

app.post("/reset-password", (req, res, next) => {
  const username = req.body.username
  return User.findOne({ username: username }, (err, user) => {
    if (err) {
      console.log(err)
    }
    if (user) {
      user.setPassword(req.body.pass, function () {
        user.save();
        console.log('Password Updated');
        res.redirect("/signin")
      });
    } else {
      console.log('This user does not exist');
    }
  });
})

app.get("/home", (req, res, next) => {
  if (req.isAuthenticated()) {
    res.render("client/home.ejs")
  }
  else {
    res.redirect("/signin")
  }
})

app.get("/my-bookings", (req, res, next) => {
  const date = new Date()
  Book.find(
    {
      userid: req.user.id,
      check_out_date: { $lt: new Date(date).toISOString() }
    }, { userid: 0 }, { sort: { check_out_date: -1 } }, (err, prevBooking) => {
      if (err) {
        console.log(err);
      }
      else {
        Book.find(
          {
            userid: req.user.id,
            check_out_date: { $gte: new Date(date).toISOString() }
          }, { userid: 0 }, { sort: { check_in_date: 1 } }, (err, currBooking) => {
            if (err) {
              console.log(err)
            }
            else {
              if (req.isAuthenticated()) {
                res.render("client/mybookings.ejs", { prevBooking: prevBooking, currBooking: currBooking })
              }
              else {
                res.redirect("/signin")
              }
            }
          })
      }
    })
})

app.post("/delete-room", (req, res, next) => {
  const id = req.body.id;
  Book.findOne({ _id: id }, (err, booked) => {
    if (err) {
      console.log(err);
    }
    else {
      Book.findByIdAndRemove(id, err => {
        if (err) {
          console.log(err)
        }
        else {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.USERNAME_O.toString(),
              pass: process.env.PASSWORD.toString(),
            },
          });
          var mailOptions = {
            from: process.env.USERNAME_O,
            to: "akashdevelops@gmail.com",
            subject: 'Room deleted',
            text: "Booking ID : " + new String(booked._id).toString() + "\n\nRoom Number : " + new String(booked.room_id).toString() + "\n\nAmount : " + new String(booked.amount).toString() + "\n\nCheck In Date : " + new String(new Date(booked.check_in_date)) + "\n\nCheck Out Date : " + new String(new Date(booked.check_out_date)) + "\n\nArrival Time : " + new String(booked.check_in_time) + "\n\nThe above booking is cancelled"
          };

          transporter.sendMail(mailOptions, function (error, info) {
            if (error)
              throw Error(error);
            else {
              console.log('Delete Email Sent Successfully');
            }
          });
          res.redirect("/my-bookings");
        }
      })
    }
  })
})

app.get("/logout", (req, res) => {
  req.logout(err => {
    if (err) {
      console.log(err);
    }
  });
  res.redirect("/");
});

app.post("/book-room", (req, res, next) => {
  const type = req.body.roomType;
  roomDetails = {
    type: type
  }
  if (req.isAuthenticated()) {
    res.render("client/booking.ejs", { roomDetails: roomDetails });
  }
  else {
    res.redirect("/signin")
  }
})


app.post("/payment", (req, res, next) => {
  const type = req.body.type;
  const date = req.body.date;
  const arrivalDate = new Date(req.body.date).getTime();
  const time = req.body.time;
  const person = req.body.person;
  const days = req.body.days;
  const depatureDate = arrivalDate + 24 * 60 * 60 * 1000 * (days - 1);

  Book.find({
    type: type,
    $or: [
      { check_in_date: { $lte: new Date(depatureDate).toISOString(), $gte: new Date(arrivalDate).toISOString() } },
      { check_out_date: { $lte: new Date(depatureDate).toISOString(), $gte: new Date(arrivalDate).toISOString() } },
      { $and: [{ check_in_date: { $lte: new Date(arrivalDate).toISOString() } }, { check_out_date: { $gte: new Date(depatureDate).toISOString() } }] }
    ]
  }).exec((err, bookedDetails) => {
    Room.find({ type: type }).exec((err, totalRooms) => {

      let bookedRooms = 0;
      for (let i = 0; i < bookedDetails.length; i++) {
        bookedRooms += bookedDetails[i]["room_id"].length;
      }

      const availRooms = totalRooms.length - bookedRooms;
      if (availRooms === 0) {
        if (req.isAuthenticated()) {
          res.render("client/unavailable.ejs")
        }
        else {
          res.redirect("/signin")
        }
      }
      else {
        Room.findOne({ type: type }, (err, room) => {
          details = {
            type: type,
            date: date,
            time: time,
            days: days,
            person: person,
            maxRooms: availRooms,
            amount: room.rentPerDay
          }
          if (req.isAuthenticated()) {
            res.render("client/payment.ejs", details);
          }
          else {
            res.redirect("/signin")
          }
        })
      }
    })
  });

})

app.post("/hall-payment", (req, res, next) => {

  const type = req.body.type;
  const date = req.body.date;
  const arrivalDate = new Date(req.body.date).getTime();
  const time = req.body.time;
  const person = req.body.person;
  const days = req.body.days;
  const depatureDate = arrivalDate + 24 * 60 * 60 * 1000 * (days - 1);

  Book.find({
    type: type,
    $or: [
      { check_in_date: { $lte: new Date(depatureDate).toISOString(), $gte: new Date(arrivalDate).toISOString() } },
      { check_out_date: { $lte: new Date(depatureDate).toISOString(), $gte: new Date(arrivalDate).toISOString() } },
      { $and: [{ check_in_date: { $lte: new Date(arrivalDate).toISOString() } }, { check_out_date: { $gte: new Date(depatureDate).toISOString() } }] }
    ]
  }).exec((err, bookedDetails) => {
    if (bookedDetails.length !== 0) {
      if (req.isAuthenticated()) {
        res.render("client/unavailablehall.ejs")
      }
      else {
        res.redirect("/signin")
      }
    }
    else {
      Room.find({ type: type }, (err, room) => {
        const amount = room[0]["rentPerDay"] * days;
        details = {
          type: type,
          date: date,
          time: time,
          days: days,
          person: person,
          amount: amount
        }
        if (req.isAuthenticated()) {
          res.render("client/hallpayment.ejs", { details: details })
        }
        else {
          res.redirect("/signin")
        }
      })
    }
  })
});


app.post("/confirmation", (req, res, next) => {
  const type = req.body.type;
  const arrivalDate = new Date(req.body.date).getTime();
  const time = req.body.time;
  const person = req.body.person;
  const days = req.body.days;
  const depatureDate = arrivalDate + 24 * 60 * 60 * 1000 * (days - 1);
  const room_count = req.body.room_count;

  Book.find({
    type: type,
    check_in_date: { $lte: new Date(depatureDate).toISOString(), $gte: new Date(arrivalDate).toISOString() },
    check_out_date: { $lte: new Date(depatureDate).toISOString(), $gte: new Date(arrivalDate).toISOString() }
  }).exec((err, bookedDetails) => {
    let bookedRooms = [];
    // getting booked room ids 
    for (let i = 0; i < bookedDetails.length; i++) {
      bookedRooms = bookedRooms.concat(bookedDetails[i]["room_id"]);
    }

    // getting unbooked rooms
    Room.find({
      type: type, room_id: { $nin: bookedRooms }
    }).exec((err, totalRooms) => {
      let bookingRooms = [];
      let amount = 0;
      for (let i = 0; i < room_count; i++) {
        bookingRooms[i] = totalRooms[i]["room_id"];
        amount += totalRooms[i]["rentPerDay"];
      }
      amount *= days;
      //Add booking
      const newBooking = new Book({
        userid: mongoose.Types.ObjectId(req.user.id),
        room_id: bookingRooms,
        type: type,
        amount: amount,
        check_in_date: req.body.date,
        check_out_date: new Date(depatureDate).toISOString(),
        check_in_time: time,
        no_of_person: person
      })

      newBooking.save();
      const id = newBooking._id;

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.USERNAME_O.toString(),
          pass: process.env.PASSWORD.toString(),
        },
      });
      var mailOptions = {
        from: process.env.USERNAME_O,
        to: "akashdevelops@gmail.com",
        subject: 'Room Booked',
        text: "Booking ID : " + new String(id).toString() + "\n\nRoom Number : " + new String(newBooking.room_id).toString() + "\n\nAmount : " + new String(newBooking.amount).toString() + "\n\nCheck In Date : " + new String(new Date(newBooking.check_in_date)) + "\n\nCheck Out Date : " + new String(new Date(newBooking.check_out_date)) + "\n\nArrival Time : " + new String(newBooking.check_in_time) + "\n\nThe above booking is done"
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error)
          throw Error(error);
        else {
          console.log('Booking Email Sent Successfully');
        }
      });
      if (req.isAuthenticated()) {
        res.render("client/confirmation.ejs", { Id: id });
      }
      else {
        res.redirect("/signin")
      }
    })
  })
})

app.post("/confirmation-hall", (req, res, next) => {

  const type = req.body.type;
  const arrivalDate = new Date(req.body.date).getTime();
  const time = req.body.time;
  const person = req.body.person;
  const days = req.body.days;
  const depatureDate = arrivalDate + 24 * 60 * 60 * 1000 * (days - 1);
  const amount = req.body.amount
  const date = req.body.date

  Room.find({ type: type }).exec((err, room) => {
    let hall = []
    const room_id = room[0]["room_id"];
    hall.push(room_id)
    const newBooking = new Book({
      userid: req.user.id,
      room_id: hall,
      type: type,
      amount: amount,
      check_in_date: date,
      check_out_date: new Date(depatureDate).toISOString(),
      check_in_time: time,
      no_of_person: person
    })
    newBooking.save();
    const id = newBooking._id;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.USERNAME_O.toString(),
        pass: process.env.PASSWORD.toString(),
      },
    });
    var mailOptions = {
      from: process.env.USERNAME_O,
      to: "akashdevelops@gmail.com",
      subject: 'Hall Booked',
      text: "Booking ID : " + new String(id).toString() + "\n\nHall type : " + new String(newBooking.room_id).toString() + "\n\nAmount : " + new String(newBooking.amount).toString() + "\n\nCheck In Date : " + new String(new Date(newBooking.check_in_date)) + "\n\nCheck Out Date : " + new String(new Date(newBooking.check_out_date)) + "\n\nArrival Time : " + new String(newBooking.check_in_time) + "\n\nThe above booking is done"
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error)
        throw Error(error);
      else {
        console.log('Hall Booking Email Sent Successfully');
      }
    });

    if (req.isAuthenticated()) {
      res.render("client/confirmation.ejs", { Id: id });
    }
    else {
      res.redirect("/signin")
    }
  })
})

app.get("/business-hall", (req, res, next) => {
  if (req.isAuthenticated()) {
    res.render("client/business.ejs")
  }
  else {
    res.redirect("/signin")
  }
})

app.get("/birthday-hall", (req, res, next) => {
  if (req.isAuthenticated()) {
    res.render("client/birthday.ejs")
  }
  else {
    res.redirect("/signin")
  }
})

app.get("/wedding-hall", (req, res, next) => {

  if (req.isAuthenticated()) {
    res.render("client/wedding.ejs")
  }
  else {
    res.redirect("/signin")
  }

})

app.get("/profile", (req, res, next) => {
  if (req.isAuthenticated()) {
    const id = req.user.id
    User.findById(id, (err, user) => {
      if (err) {
        console.log(err)
      }
      else {
        Item = {
          name: user.name,
          username: user.username,
          phone: user.phone
        }
        res.render("client/profile.ejs", { details: Item, response: "" })
      }
    })
  }
  else {
    res.redirect("/signin")
  }
})

app.get("/admin-home", (req, res, next) => {
  const id = req.user.id
  User.findOne({ _id: id }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        Room.find({ type: "Sea Side" }, (err1, seaside) => {
          if (!err1) {
            Room.find({ type: "Deluxe" }, (err2, deluxe) => {
              if (!err2) {
                Room.find({ type: "King Size" }, (err3, kingsize) => {
                  if (!err3) {
                    Room.find({ $or: [{ type: "Birthday" }, { type: "Business" }, { type: "Wedding" }] }, (err4, halls) => {
                      if (!err3) {
                        res.render("admin/home.ejs", { seaside: seaside, deluxe: deluxe, kingsize: kingsize, halls: halls })
                      }
                    })
                  }
                })
              }
            })
          }
        })
      }
    }
  })
})

app.get("/admin-add-rooms", (req, res) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        res.render("admin/addroom.ejs")
      }
    }
  })
})

app.post("/admin-add-rooms", (req, res) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        const type = req.body.type
        Room.findOne({ type: type }, (err, roomRent) => {
          const newRoom = new Room({
            room_id: req.body.room_id,
            type: req.body.type,
            rentPerDay: roomRent.rentPerDay
          });
          newRoom.save();
          res.redirect("/admin-home")
        })
      }
    }
  })
});

app.post("/admin-delete-room", (req, res, next) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        const id = req.body.id;
        Room.findByIdAndRemove(id, err => {
          if (err) {
            console.log(err)
          }
          else {
            res.redirect("/admin-home");
          }
        })
      }
    }
  })
})

app.post("/admin-update-room", (req, res) => {
  const id = req.body.id;
  Room.findByIdAndRemove(id, err => {
    if (err) {
      console.log(err)
    }
    else {
      const type = req.body.type;
      const newRent = req.body.newRent;
      Room.updateMany({ type: type }, { rentPerDay: newRent }, (err, rentUpdated) => {
        if (err) {
          console.log(err);
        }
        else {
          res.redirect("/admin-home")
        }
      });
    }
  })
});

app.get("/admin-viewbookings", (req, res, next) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        const date1 = new Date()
        const date = new Date(date1.valueOf() - 1000 * 60 * 60 * 24);
        try {
          const getBooks = async () => {
            const response = await Book.aggregate([
              {
                $match: { check_in_date: { $gte: date } }
              },
              {
                $lookup: {
                  from: "users",
                  localField: "userid",
                  foreignField: "_id",
                  as: "userDetails"
                }
              },
              {
                $project: {
                  "userDetails._id": 0,
                  "userDetails.salt": 0,
                  "userDetails.hash": 0,
                  "userDetails.isAdmin": 0
                }
              }
            ])
            if ([...response].length !== 0) {
              res.render("admin/viewbooking.ejs", { bookedRooms: response, msg: "The Current Bookings are : " })
            }
            else {
              res.render("admin/viewbooking.ejs", { bookedRooms: [], msg: "No Current Bookings available..." })
            }
          }
          getBooks();
        }
        catch (err) {
          console.log(err)
        }
      }
    }
  })
})

app.get("/admin-viewemployees", (req, res, next) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        Employee.find({}, (err, employee) => {
          res.render("admin/viewemployees.ejs", { employees: employee })
        })
      }
    }
  })
})

app.get("/admin-addemployee", (req, res, next) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        res.render("admin/addemployee.ejs")
      }
    }
  })
})

app.post("/admin-addemployee", (req, res, next) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        const date = new Date()
        const newEmployee = new Employee({
          name: req.body.name,
          phone: req.body.phone,
          dateOfJoin: date,
          work: req.body.work,
          salary: req.body.salary
        })
        newEmployee.save();
        res.redirect("/admin-viewemployees")
      }
    }
  })
})

app.post("/admin-remove-employee", (req, res, next) => {
  const uid = req.user.id
  User.findOne({ _id: uid }, (err, user) => {
    if (err) {
      console.log(err)
    }
    else {
      isAdmin = user.isAdmin
      if (req.isAuthenticated() && isAdmin) {
        const id = req.body.id;
        Employee.findByIdAndRemove(id, err => {
          if (err) {
            console.log(err)
          }
          else {
            res.redirect("/admin-viewemployees");
          }
        })
      }
    }
  })
})

app.post("/admin-viewbookings", viewBooking, renderBooking)
app.post("/updatepassword", updatePwd, renderProfile);
app.post("/updatephone", updatePhone, renderProfile);

app.get("/", (req, res, next) => {
  res.render("common/landingpage.ejs")
})

app.listen(process.env.PORT || 3000, () => {
  console.log("Server is live");
});
