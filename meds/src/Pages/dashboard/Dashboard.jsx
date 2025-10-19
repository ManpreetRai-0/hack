import * as React from 'react';
import {
  Box, Button, Typography, TextField, Paper,
  MenuItem, Select, InputLabel, FormControl,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider
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
  const [selectedDate] = React.useState(dayjs());
  const [events, setEvents] = React.useState({});
  const [takenEvents, setTakenEvents] = React.useState({});
  const [viewLinked, setViewLinked] = React.useState(false);

  // Invite popup state
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
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

  // ------------------ FIREBASE HELPERS ------------------

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

    } catch (error) {
      console.error('❌ Error saving to Firebase:', error);
    }
  };

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

  // ------------------ INVITE SYSTEM ------------------

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
      setInviteOpen(false);
      setInviteEmail("");
    } catch (err) {
      console.error("Error sending invite:", err);
    }
  };

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

  const acceptInvite = async (inviteId, fromEmail) => {
    const user = auth.currentUser;
    if (!user) return;

    const sanitizedFrom = fromEmail.replace(/\./g, "_");
    const sanitizedTo = user.email.replace(/\./g, "_");

    await updateDoc(doc(db, "invitations", inviteId), { status: "accepted" });
    await setDoc(doc(db, "users", sanitizedFrom), { linkedUsers: [user.email] }, { merge: true });
    await setDoc(doc(db, "users", sanitizedTo), { viewing: fromEmail }, { merge: true });

    checkInvites();
  };

  const declineInvite = async (inviteId) => {
    await updateDoc(doc(db, "invitations", inviteId), { status: "declined" });
    checkInvites();
  };

  const daysOfWeek = getNextWeekDays(selectedDate);

  // ------------------ UI ------------------

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ maxWidth: "900px", mx: "auto", p: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" fontWeight="bold" sx={{ mr: 3 }}>
            {viewLinked ? "Linked User's Dashboard" : "My Prescription Dashboard"}
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => setInviteOpen(true)}
              sx={{ borderRadius: 2 }}
            >
              Invite User
            </Button>
            <Button
              variant="outlined"
              onClick={() => setViewLinked((prev) => !prev)}
              sx={{ borderRadius: 2 }}
            >
              {viewLinked ? "View My Dashboard" : "View Linked User"}
            </Button>
          </Box>
        </Box>


        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <Paper sx={{ p: 3, mb: 4 }} elevation={3}>
            <Typography variant="h6" gutterBottom>Pending Invites</Typography>
            {pendingInvites.map((invite) => (
              <Box key={invite.id} sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Typography sx={{ flex: 1 }}>{invite.from} invited you</Typography>
                <Button
                  variant="contained"
                  size="small"
                  color="primary"
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
          </Paper>
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
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={sendInvite} variant="contained">Send Invite</Button>
          </DialogActions>
        </Dialog>

        {/* Prescription Form */}
        {!viewLinked && (
          <Paper sx={{ p: 3, mb: 4 }} elevation={3}>
            <Typography variant="h6" gutterBottom>Add a New Prescription</Typography>
            <Divider sx={{ mb: 2 }} />
            <TextField fullWidth label="Prescription Name" value={prescription.name}
              onChange={(e) => setPrescription({ ...prescription, name: e.target.value })}
              sx={{ mb: 2 }} />
            <TextField fullWidth label="Dosage" value={prescription.dosage}
              onChange={(e) => setPrescription({ ...prescription, dosage: e.target.value })}
              sx={{ mb: 2 }} />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Frequency</InputLabel>
              <Select
                value={prescription.frequency}
                onChange={(e) => setPrescription({ ...prescription, frequency: e.target.value })}
              >
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="every-2-days">Every 2 Days</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
              </Select>
            </FormControl>

            <Typography variant="subtitle1" gutterBottom>Times Per Day</Typography>
            {prescription.timesPerDay.map((time, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TextField
                  type="time"
                  value={time}
                  onChange={(e) => {
                    const times = [...prescription.timesPerDay];
                    times[idx] = e.target.value;
                    setPrescription({ ...prescription, timesPerDay: times });
                  }}
                  sx={{ mr: 2 }}
                />
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    const filtered = prescription.timesPerDay.filter((_, i) => i !== idx);
                    setPrescription({ ...prescription, timesPerDay: filtered });
                  }}
                  disabled={prescription.timesPerDay.length === 1}
                >
                  Remove
                </Button>
              </Box>
            ))}
            <Button
              variant="outlined"
              onClick={() => {
                setPrescription({
                  ...prescription,
                  timesPerDay: [...prescription.timesPerDay, '08:00'],
                });
              }}
              sx={{ mb: 2 }}
            >
              Add Time
            </Button>

            <TextField fullWidth label="Start Date" type="date"
              value={prescription.startDate.format('YYYY-MM-DD')}
              onChange={(e) => setPrescription({ ...prescription, startDate: dayjs(e.target.value) })}
              sx={{ mb: 2 }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField fullWidth label="End Date (Optional)" type="date"
              value={prescription.endDate ? prescription.endDate.format('YYYY-MM-DD') : ''}
              onChange={(e) => setPrescription({
                ...prescription,
                endDate: e.target.value ? dayjs(e.target.value) : null
              })}
              sx={{ mb: 2 }}
              InputLabelProps={{ shrink: true }}
            />

            <Button variant="contained" onClick={handleAddPrescription} sx={{ width: '100%' }}>
              Add Prescription Reminder
            </Button>
          </Paper>
        )}

        {/* Weekly Events */}
        <Typography variant="h5" sx={{ mb: 2 }}>Weekly Schedule</Typography>
        {getNextWeekDays(selectedDate).map((day, index) => {
          const dateKey = day.format('YYYY-MM-DD');
          return (
            <Paper key={index} sx={{ mb: 3, p: 3 }} elevation={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6">{day.format('dddd')}</Typography>
                <Typography color="text.secondary">{day.format('MMM D')}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
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
                        p: 2,
                        my: 1,
                        borderRadius: 2,
                        boxShadow: 1,
                      }}
                    >
                      <Typography variant="body1">
                        {event} {isTaken && "✔️"}
                      </Typography>

                      {isToday && !viewLinked && (
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() =>
                            setTakenEvents((prev) => ({
                              ...prev,
                              [eventKey]: !isTaken,
                            }))
                          }
                          sx={{
                            ml: 2,
                            borderRadius: 2,
                            bgcolor: isTaken ? "success.main" : "primary.main",
                            "&:hover": { bgcolor: isTaken ? "success.dark" : "primary.dark" },
                          }}
                        >
                          {isTaken ? "Taken" : "Mark Taken"}
                        </Button>
                      )}
                    </Box>
                  );
                })}
                {!(events[dateKey] && events[dateKey].length) && (
                  <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 1 }}>
                    No events for this day.
                  </Typography>
                )}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </LocalizationProvider>
  );
}
