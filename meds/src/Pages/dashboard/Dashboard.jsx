import * as React from 'react';
import {
  Box, Button, Typography, TextField, Paper,
  MenuItem, Select, InputLabel, FormControl,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import dayjs from 'dayjs';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { auth, db } from '../../firebase';
import {
  collection, addDoc, query, where,
  getDocs, doc, updateDoc, setDoc, getDoc
} from 'firebase/firestore';

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = React.useState(dayjs());
  const [events, setEvents] = React.useState({});
  const [takenEvents, setTakenEvents] = React.useState({});
  const [viewLinked, setViewLinked] = React.useState(false);

  // Invite popup state
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");

  // Invitations
  const [pendingInvites, setPendingInvites] = React.useState([]);

  const [prescription, setPrescription] = React.useState({
    name: '',
    dosage: '',
    frequency: 'daily',
    startDate: dayjs(),
    endDate: null,
    timesPerDay: ['08:00']
  });

  const todayKey = dayjs().format("YYYY-MM-DD");

  React.useEffect(() => {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
    checkInvites();
    fetchOwnPrescriptions();
  }, []);

  // When toggling linked user view, fetch linked data
  React.useEffect(() => {
    if (viewLinked) {
      fetchLinkedUserPrescriptions();
    } else {
      fetchOwnPrescriptions();
    }
  }, [viewLinked]);

  const getNextWeekDays = (date) => {
    return [...Array(7)].map((_, index) => date.add(index, 'day'));
  };

  const scheduleNotification = (title, body, dateTime) => {
    const now = dayjs();
    const delay = dateTime.diff(now, 'millisecond');
    if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
      setTimeout(() => {
        new Notification(title, { body });
      }, delay);
    }
  };

  // ✅ Save prescription to Firestore
  const savePrescriptionToFirebase = async (prescriptionData, eventsByDate) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const sanitizedEmail = user.email.replace(/\./g, '_');
      const prescriptionsRef = collection(db, 'users', sanitizedEmail, 'prescriptions');

      await addDoc(prescriptionsRef, {
        ...prescriptionData,
        startDate: prescriptionData.startDate.toDate(),
        endDate: prescriptionData.endDate ? prescriptionData.endDate.toDate() : null,
        eventsByDate
      });

      console.log('✅ Prescription saved successfully.');
    } catch (error) {
      console.error('❌ Error saving to Firebase:', error);
    }
  };

  // ✅ Fetch own prescriptions
  const fetchOwnPrescriptions = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const sanitizedEmail = user.email.replace(/\./g, '_');
    const prescriptionsRef = collection(db, "users", sanitizedEmail, "prescriptions");

    const snapshot = await getDocs(prescriptionsRef);
    let allEvents = {};
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.eventsByDate) {
        allEvents = { ...allEvents, ...data.eventsByDate };
      }
    });
    setEvents(allEvents);
  };

  // ✅ Fetch linked user's prescriptions
  const fetchLinkedUserPrescriptions = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const userDoc = await getDoc(doc(db, "users", user.email.replace(/\./g, "_")));
    if (!userDoc.exists()) return;

    const linkedEmail = userDoc.data().viewing;
    if (!linkedEmail) return;

    const sanitizedEmail = linkedEmail.replace(/\./g, '_');
    const prescriptionsRef = collection(db, "users", sanitizedEmail, "prescriptions");

    const snapshot = await getDocs(prescriptionsRef);
    let allEvents = {};
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.eventsByDate) {
        allEvents = { ...allEvents, ...data.eventsByDate };
      }
    });
    setEvents(allEvents);
  };

  // ✅ Add new prescription
  const handleAddPrescription = () => {
    const { name, dosage, frequency, startDate, endDate, timesPerDay } = prescription;
    if (!name || !dosage || timesPerDay.length === 0) return;

    const updatedEvents = { ...events };

    let step = 1;
    if (frequency === "every-2-days") step = 2;
    if (frequency === "weekly") step = 7;

    for (let i = 0; i < 7; i += step) {
      const date = startDate.add(i, "day");
      if (endDate && date.isAfter(endDate, "day")) continue;

      const dateKey = date.format("YYYY-MM-DD");

      timesPerDay.forEach((time) => {
        const eventDescription = `${name} - ${dosage} at ${time}`;
        if (!updatedEvents[dateKey]) updatedEvents[dateKey] = [];
        updatedEvents[dateKey].push(eventDescription);

        if (Notification.permission === "granted") {
          const dateTime = dayjs(`${dateKey}T${time}`);
          if (dateTime.isAfter(dayjs())) {
            scheduleNotification("Pill Reminder", eventDescription, dateTime);
          }
        }
      });
    }

    setEvents(updatedEvents);
    savePrescriptionToFirebase(prescription, updatedEvents);

    setPrescription({
      name: "",
      dosage: "",
      frequency: "daily",
      startDate: dayjs(),
      endDate: null,
      timesPerDay: ["08:00"],
    });
  };

  // ========== INVITATION SYSTEM ==========

  // Send invite
  const sendInvite = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await addDoc(collection(db, "invitations"), {
        from: user.email,
        to: inviteEmail,
        status: "pending",
        createdAt: new Date(),
      });
      alert("✅ Invite sent!");
      setInviteOpen(false);
      setInviteEmail("");
    } catch (err) {
      console.error("Error sending invite:", err);
    }
  };

  // Check invites for current user
  const checkInvites = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "invitations"),
      where("to", "==", user.email),
      where("status", "==", "pending")
    );

    const snapshot = await getDocs(q);
    const invites = [];
    snapshot.forEach((docSnap) => {
      invites.push({ id: docSnap.id, ...docSnap.data() });
    });
    setPendingInvites(invites);
  };

  // Accept invite
  const acceptInvite = async (inviteId, fromEmail) => {
    const user = auth.currentUser;
    if (!user) return;

    const sanitizedFrom = fromEmail.replace(/\./g, "_");
    const sanitizedTo = user.email.replace(/\./g, "_");

    await updateDoc(doc(db, "invitations", inviteId), {
      status: "accepted"
    });

    await setDoc(doc(db, "users", sanitizedFrom), { linkedUsers: [user.email] }, { merge: true });
    await setDoc(doc(db, "users", sanitizedTo), { viewing: fromEmail }, { merge: true });

    alert("✅ Invite accepted!");
    checkInvites();
  };

  // Decline invite
  const declineInvite = async (inviteId) => {
    await updateDoc(doc(db, "invitations", inviteId), {
      status: "declined"
    });
    checkInvites();
  };

  const daysOfWeek = getNextWeekDays(selectedDate);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, width: '100%' }}>
        
        {/* Header with Linked User Toggle and Invite */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 2 }}>
          <Typography variant="h6">
            {viewLinked ? "Linked User's Dashboard" : "My Prescription Dashboard"}
          </Typography>
          <Box>
            <Button variant="outlined" onClick={() => setInviteOpen(true)} sx={{ mr: 2 }}>
              Invite User
            </Button>
            <Button
              variant="outlined"
              onClick={() => setViewLinked((prev) => !prev)}
            >
              {viewLinked ? "View My Dashboard" : "View Linked User"}
            </Button>
          </Box>
        </Box>

        {/* Accept/Decline pending invites */}
        {pendingInvites.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1">Pending Invites:</Typography>
            {pendingInvites.map((invite) => (
              <Box key={invite.id} sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                <Typography sx={{ mr: 2 }}>{invite.from} invited you</Typography>
                <Button
                  variant="contained"
                  size="small"
                  sx={{ mr: 1 }}
                  onClick={() => acceptInvite(invite.id, invite.from)}
                >
                  Accept
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  onClick={() => declineInvite(invite.id)}
                >
                  Decline
                </Button>
              </Box>
            ))}
          </Box>
        )}

        {/* Invite Dialog */}
        <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)}>
          <DialogTitle>Invite Linked User</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="User Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={sendInvite} variant="contained">Send Invite</Button>
          </DialogActions>
        </Dialog>

        {/* Prescription Form (only for own dashboard) */}
        {!viewLinked && (
          <Box sx={{ width: '100%', mb: 2 }}>
            {/* Form fields here (same as before) */}
            {/* ... */}
          </Box>
        )}

        {/* Display Weekly Events */}
        <Box sx={{ width: '100%' }}>
          {daysOfWeek.map((day, index) => {
            const dateKey = day.format('YYYY-MM-DD');
            return (
              <Paper key={index} sx={{ mb: 2, p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="h6">{day.format('dddd')}</Typography>
                  <Typography>{day.format('MMM D')}</Typography>
                </Box>
                <Box sx={{ mt: 1 }}>
                  {(events[dateKey] || []).map((event, idx) => {
                    const isToday = dateKey === todayKey;
                    const eventKey = `${dateKey}-${idx}`;
                    const isTaken = takenEvents[eventKey];

                    return (
                      <Box
                        key={idx}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: isTaken ? "#e8f5e9" : "#f9f9f9",
                          p: 1,
                          my: 0.5,
                          borderRadius: 1,
                        }}
                      >
                        <Typography variant="body2">
                          {event} {isTaken && "✔️"}
                        </Typography>

                        {isToday && !viewLinked && (
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() =>
                              setTakenEvents((prev) => ({
                                ...prev,
                                [eventKey]: !isTaken,
                              }))
                            }
                            sx={{
                              ml: 2,
                              bgcolor: isTaken ? "lightgreen" : "white",
                              "&:hover": { bgcolor: isTaken ? "lightgreen" : "#f0f0f0" },
                            }}
                          >
                            {isTaken ? "Taken" : "Mark Taken"}
                          </Button>
                        )}
                      </Box>
                    );
                  })}
                  {!(events[dateKey] && events[dateKey].length) && (
                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                      No events for this day.
                    </Typography>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
