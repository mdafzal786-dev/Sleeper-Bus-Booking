require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Logs every request with time and route (useful while testing APIs)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const database = {
  bus: {
    id: "BUS001",
    name: "Sleeper Express",
    route: "Ahmedabad → Mumbai",
    totalSeats: 40,
    layout: "sleeper",
  },

  // Order matters here because distance and seat segments depend on it
  stations: [
    { id: "ST001", name: "Ahmedabad", distance: 0 },
    { id: "ST002", name: "Vadodara", distance: 110 },
    { id: "ST003", name: "Surat", distance: 260 },
    { id: "ST004", name: "Mumbai", distance: 530 },
  ],

  seats: [],
  bookings: [],

  meals: [
    { id: "M001", name: "Veg Thali", type: "veg", price: 150 },
    { id: "M002", name: "Paneer Combo", type: "veg", price: 180 },
    { id: "M003", name: "Chicken Biryani", type: "non-veg", price: 220 },
    { id: "M004", name: "Jain Thali", type: "jain", price: 160 },
  ],
};

// Creates seats and alternates between lower and upper berth
// bookedSegments is used for partial journey booking
function generateSeats(count) {
  const seatTypes = ["lower", "upper"];
  return Array.from({ length: count }, (_, i) => ({
    id: `S${String(i + 1).padStart(3, "0")}`,
    number: i + 1,
    type: seatTypes[i % 2],
    isBooked: false,
    bookedSegments: [],
  }));
}

database.seats = generateSeats(40);

// Checks seat availability for selected source and destination
// Seat is unavailable only if journey overlaps with existing booking
function isSeatAvailable(seat, from, to) {
  const fromIndex = database.stations.findIndex(s => s.id === from);
  const toIndex = database.stations.findIndex(s => s.id === to);

  for (const seg of seat.bookedSegments) {
    const segFrom = database.stations.findIndex(s => s.id === seg.from);
    const segTo = database.stations.findIndex(s => s.id === seg.to);

    if (!(toIndex <= segFrom || fromIndex >= segTo)) {
      return false;
    }
  }
  return true;
}

// Fare is calculated using distance difference between stations
function calculateFare(from, to) {
  const f = database.stations.find(s => s.id === from);
  const t = database.stations.find(s => s.id === to);
  return f && t ? Math.abs(t.distance - f.distance) * 0.8 : 0;
}

app.get("/api/stations", (req, res) => {
  res.json({ success: true, data: database.stations });
});

app.get("/api/seats", (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ success: false, message: "From & To required" });
  }

  // Adds availability and fare info for each seat
  const seats = database.seats.map(seat => ({
    ...seat,
    available: isSeatAvailable(seat, from, to),
    fare: calculateFare(from, to),
  }));

  res.json({ success: true, data: seats });
});

app.get("/api/meals", (req, res) => {
  res.json({ success: true, data: database.meals });
});

app.post("/api/bookings", (req, res) => {
  const { seatIds, fromStation, toStation, passenger, meals } = req.body;

  if (!seatIds || !fromStation || !toStation || !passenger) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  // Check all seats again before booking
  for (let id of seatIds) {
    const seat = database.seats.find(s => s.id === id);
    if (!seat || !isSeatAvailable(seat, fromStation, toStation)) {
      return res.status(400).json({ success: false, message: `Seat ${id} unavailable` });
    }
  }

  const booking = {
    id: `BK${Date.now()}`,
    seatIds,
    fromStation,
    toStation,
    passenger,
    meals: meals || [],
    fare: calculateFare(fromStation, toStation) * seatIds.length,
    status: "confirmed",
    createdAt: new Date(),
  };

  // Save only this journey segment in seat booking
  seatIds.forEach(id => {
    const seat = database.seats.find(s => s.id === id);
    seat.isBooked = true;
    seat.bookedSegments.push({ from: fromStation, to: toStation });
  });

  database.bookings.push(booking);
  res.status(201).json({ success: true, data: booking });
});

app.put("/api/bookings/:id/cancel", (req, res) => {
  const booking = database.bookings.find(b => b.id === req.params.id);

  if (!booking) {
    return res.status(404).json({ success: false, message: "Booking not found" });
  }

  booking.status = "cancelled";

  booking.seatIds.forEach(seatId => {
    const seat = database.seats.find(s => s.id === seatId);

    // Remove only cancelled route from seat
    seat.bookedSegments = seat.bookedSegments.filter(
      seg => !(seg.from === booking.fromStation && seg.to === booking.toStation)
    );

    if (seat.bookedSegments.length === 0) {
      seat.isBooked = false;
    }
  });

  res.json({ success: true, message: "Booking cancelled successfully" });
});

app.get("/api/bookings", (req, res) => {
  res.json({ success: true, data: database.bookings });
});

app.get("/api/availability", (req, res) => {
  const { seatId, from, to } = req.query;
  const seat = database.seats.find(s => s.id === seatId);

  if (!seat) {
    return res.status(404).json({ success: false, message: "Seat not found" });
  }

  res.json({
    success: true,
    available: isSeatAvailable(seat, from, to),
  });
});

app.get("/api/statistics", (req, res) => {
  const totalBookings = database.bookings.length;
  const confirmedBookings = database.bookings.filter(b => b.status === "confirmed").length;
  const cancelledBookings = database.bookings.filter(b => b.status === "cancelled").length;

  const occupiedSeats = database.seats.filter(
    seat => seat.bookedSegments.length > 0
  ).length;

  const occupancyRate = (
    (occupiedSeats / database.seats.length) * 100
  ).toFixed(2);

  res.json({
    success: true,
    data: {
      totalBookings,
      confirmedBookings,
      cancelledBookings,
      occupiedSeats,
      occupancyRate: occupancyRate + "%",
    },
  });
});

// Handles wrong or undefined API routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚌 Sleeper Bus Booking API running on port ${PORT}`);
});
