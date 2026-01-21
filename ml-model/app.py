import streamlit as st
import requests
from random import randint

API_URL = "http://localhost:5000"

st.set_page_config(
    page_title="Sleeper Bus Booking Dashboard",
    page_icon="🚍",
    layout="wide"
)

st.markdown("<h1 style='text-align:center'>🚍 Sleeper Bus Booking System – Dashboard</h1>", unsafe_allow_html=True)
st.markdown("---")

def mock_confirmation_probability(from_station, to_station, num_seats, seat_type):
    """
    Mock prediction logic:
    - Random probability based on number of seats
    - Simulate higher probability for fewer seats
    """
    base = 50
    seat_factor = (4 - num_seats) * 10  # fewer seats, higher chance
    probability = base + seat_factor
    # Random small variation
    probability += randint(-10, 10)
    probability = max(0, min(100, probability))
    return probability

try:
    stations = requests.get(f"{API_URL}/api/stations").json()["data"]
    station_dict = {s["name"]: s["id"] for s in stations}
except:
    st.error("❌ Cannot fetch stations from backend")
    stations = []
    station_dict = {}

try:
    meals_data = requests.get(f"{API_URL}/api/meals").json()["data"]
    meals_dict = {m["name"]: m["id"] for m in meals_data}
except:
    st.error("❌ Cannot fetch meals from backend")
    meals_data = []
    meals_dict = {}

st.subheader("📊 Live Booking Statistics")

try:
    stats = requests.get(f"{API_URL}/api/statistics").json()["data"]
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Bookings", stats["totalBookings"], "🚌")
    col2.metric("Confirmed", stats["confirmedBookings"], "✅")
    col3.metric("Cancelled", stats["cancelledBookings"], "❌")
    col4.metric("Occupancy %", stats["occupancyRate"], "📈")
except:
    st.error("❌ Node.js backend not running on port 5000")

st.markdown("---")

st.subheader("🤖 Predict & Book Seats")
with st.form("booking_form"):
    col1, col2, col3 = st.columns(3)

    with col1:
        from_station = st.selectbox("From Station", list(station_dict.keys()))
        to_station = st.selectbox("To Station", list(station_dict.keys()))
        seat_type = st.selectbox("Seat Type", ["lower", "upper"])

    with col2:
        booking_hour = st.slider("Booking Hour", 0, 23, 12)
        num_seats = st.selectbox("Number of Seats", [1, 2, 3, 4])
        selected_meals = st.multiselect("Select Meals", list(meals_dict.keys()))

    with col3:
        advance_days = st.slider("Advance Booking Days", 0, 30, 5)
        travel_month = st.selectbox("Travel Month", list(range(1, 13)))
        passenger_name = st.text_input("Passenger Name", "Afzal")
        passenger_age = st.number_input("Passenger Age", 1, 120, 25)

    pred_btn = st.form_submit_button("🔮 Predict Confirmation Probability")
    book_btn = st.form_submit_button("🚍 Confirm Booking")

if from_station == to_station:
    st.warning("⚠ From and To stations cannot be the same")
    pred_btn = False
    book_btn = False

if pred_btn:
    try:
        probability = mock_confirmation_probability(from_station, to_station, num_seats, seat_type)
        st.markdown(f"""
        <div style='padding:10px;border-radius:10px;background-color:#E0F7FA;'>
            <h4>✅ Confirmation Probability: <strong>{probability}%</strong></h4>
        </div>
        """, unsafe_allow_html=True)

        if probability >= 75:
            st.success("🟢 Very high chance of confirmation")
        elif probability >= 50:
            st.warning("🟡 Moderate chance of confirmation")
        else:
            st.error("🔴 High risk of cancellation")
    except Exception as e:
        st.error(f"❌ Prediction Error: {e}")

if book_btn:
    try:
        from_id = station_dict[from_station]
        to_id = station_dict[to_station]

        seats_response = requests.get(f"{API_URL}/api/seats?from={from_id}&to={to_id}").json()["data"]
        available_seats = [s["id"] for s in seats_response if s["available"] and s["type"] == seat_type]

        if len(available_seats) < num_seats:
            st.error("❌ Not enough seats available")
        else:
            seat_ids = available_seats[:num_seats]
            booking_payload = {
                "seatIds": seat_ids,
                "fromStation": from_id,
                "toStation": to_id,
                "passenger": {"name": passenger_name, "age": passenger_age},
                "meals": [meals_dict[m] for m in selected_meals] if selected_meals else []
            }

            response = requests.post(f"{API_URL}/api/bookings", json=booking_payload)
            if response.status_code == 201:
                st.success("✅ Booking Confirmed!")
                st.json(response.json()["data"])
            else:
                st.error(f"❌ Booking failed: {response.json().get('message','Unknown error')}")
    except Exception as e:
        st.error(f"❌ Error connecting to backend: {e}")

st.markdown("---")
st.subheader("🗂 Booking History & Cancel Bookings")

try:
    bookings = requests.get(f"{API_URL}/api/bookings").json()["data"]

    if bookings:
        for b in bookings:
            with st.expander(f"Booking ID: {b['id']} | Status: {b['status']}"):
                st.markdown(f"**Passenger:** {b['passenger']['name']} ({b['passenger']['age']} yrs)")
                st.markdown(f"**Seats:** {', '.join(b['seatIds'])}")
                st.markdown(f"**From → To:** {b['fromStation']} → {b['toStation']}")
                st.markdown(f"**Fare:** {b['fare']}")
                st.markdown(f"**Created:** {b['createdAt'][:19]}")

                if b["status"] == "confirmed":
                    if st.button(f"Cancel Booking", key=f"cancel_{b['id']}"):
                        try:
                            res = requests.put(f"{API_URL}/api/bookings/{b['id']}/cancel")
                            if res.json().get("success"):
                                st.success(f"Booking {b['id']} cancelled!")
                            else:
                                st.error(f"Cannot cancel booking {b['id']}")
                        except Exception as e:
                            st.error(f"Error: {e}")
    else:
        st.info("No bookings found.")
except Exception as e:
    st.error(f"Cannot fetch bookings: {e}")
