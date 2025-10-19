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
  getDocs, doc, updateDoc, setDoc, arrayUnion, getDoc, deleteDoc
} from 'firebase/firestore';
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [selectedDate] = React.useState(dayjs());
  const [prescriptions, setPrescriptions] = React.useState([]);
  const [takenEvents, setTakenEvents] = React.useState({}); // keys: `${dateKey}-${prescId}-${time}`
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [pendingInvites, setPendingInvites] = React.useState([]);
  const [linkedUsers, setLinkedUsers] = React.useState([]);
  const [selectedLinkedUser, setSelectedLinkedUser] = React.useState("");

  const navigate = useNavigate();

  const [prescription, setPrescription] = React.useState({
    name: '',
    dosage: '',
    frequency: 'daily',
    startDate: dayjs(),
    endDate: null,
    timesPerDay: ['08:00']
  });

  const todayKey = dayjs().format("YYYY-MM-DD");
  const daysOfWeek = [...Array(7)].map((_, i) => selectedDate.add(i, 'day').clone());

  // ------------------ Firebase Fetching ------------------
  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      if (Notification.permission !== 'granted') {
        Notification.requestPermission();
      }

      await fetchPrescriptions();
      await checkInvites();

      // fetch linkedUsers from the user doc
      try {
        const userDocRef = doc(db, "users", user.email.replace(/\./g, "_"));
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const linked = userDocSnap.data().linkedUsers || [];
          setLinkedUsers(linked);
        }
      } catch (err) {
        console.error("Error fetching user doc:", err);
      }
    });

    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    // reload prescriptions anytime selectedLinkedUser changes
    fetchPrescriptions();
  }, [selectedLinkedUser]);

  // ------------------ Prescriptions ------------------
  const fetchPrescriptions = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const email = selectedLinkedUser || user.email;
    const sanitizedEmail = email.replace(/\./g, '_');
    const prescriptionsRef = collection(db, "users", sanitizedEmail, "prescriptions");

    try {
      const snapshot = await getDocs(prescriptionsRef);
      const loaded = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loaded.push({
          id: docSnap.id,
          ...data,
          startDate: data.startDate ? dayjs(data.startDate.toDate()) : dayjs(),
          endDate: data.endDate ? dayjs(data.endDate.toDate()) : null
        });
      });

      setPrescriptions(loaded);

      // load taken events for TODAY for the currently signed-in user's view only
      if (!selectedLinkedUser) {
        const takenRef = collection(db, "users", sanitizedEmail, "taken", todayKey, "events");
        const takenSnapshot = await getDocs(takenRef);
        const takenObj = {};
        takenSnapshot.forEach(ts => takenObj[`${todayKey}-${ts.id}`] = true);
        setTakenEvents(takenObj);
      } else {
        setTakenEvents({});
      }
    } catch (err) {
      console.error("Error fetching prescriptions:", err);
    }
  };

  const savePrescriptionToFirebase = async (prescriptionData) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const sanitizedEmail = user.email.replace(/\./g, '_');
      const prescriptionsRef = collection(db, 'users', sanitizedEmail, 'prescriptions');

      await addDoc(prescriptionsRef, {
        ...prescriptionData,
        startDate: prescriptionData.startDate.toDate(),
        endDate: prescriptionData.endDate ? prescriptionData.endDate.toDate() : null
      });

      await fetchPrescriptions();
    } catch (error) {
      console.error('❌ Error saving to Firebase:', error);
    }
  };

  const handleAddPrescription = () => {
    const { name, dosage, timesPerDay } = prescription;
    if (!name || !dosage || timesPerDay.length === 0) return;

    savePrescriptionToFirebase(prescription);

    setPrescription({
      name: '',
      dosage: '',
      frequency: 'daily',
      startDate: dayjs(),
      endDate: null,
      timesPerDay: ['08:00']
    });
  };

  // ------------------ Toggle Taken ------------------
  const toggleTaken = async (prescriptionId, time, dateKey, eventText) => {
    const user = auth.currentUser;
    if (!user) return;

    const sanitizedEmail = user.email.replace(/\./g, "_");
    const eventKey = `${dateKey}-${prescriptionId}-${time}`;
    const eventRef = doc(db, "users", sanitizedEmail, "taken", dateKey, "events", `${prescriptionId}-${time}`);

    try {
      if (takenEvents[eventKey]) {
        // unmark
        await deleteDoc(eventRef);
        setTakenEvents(prev => {
          const copy = { ...prev };
          delete copy[eventKey];
          return copy;
        });
      } else {
        // mark as taken
        await setDoc(eventRef, { text: eventText, taken: true, timestamp: new Date() });
        setTakenEvents(prev => ({ ...prev, [eventKey]: true }));
      }
    } catch (err) {
      console.error("Error toggling taken:", err);
    }
  };

  // ------------------ Invite System ------------------
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
    snapshot.forEach((docSnap) => invites.push({ id: docSnap.id, ...docSnap.data() }));
    setPendingInvites(invites);
  };

  const acceptInvite = async (inviteId, fromEmail) => {
    const user = auth.currentUser;
    if (!user) return;

    const sanitizedFrom = fromEmail.replace(/\./g, "_");
    const sanitizedTo = user.email.replace(/\./g, "_");

    await updateDoc(doc(db, "invitations", inviteId), { status: "accepted" });
    await setDoc(doc(db, "users", sanitizedFrom), { linkedUsers: arrayUnion(user.email) }, { merge: true });
    await setDoc(doc(db, "users", sanitizedTo), { linkedUsers: arrayUnion(fromEmail) }, { merge: true });

    checkInvites();
    const userDocRef = doc(db, "users", sanitizedTo);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      setLinkedUsers(userDocSnap.data().linkedUsers || []);
    }
  };

  const declineInvite = async (inviteId) => {
    await updateDoc(doc(db, "invitations", inviteId), { status: "declined" });
    checkInvites();
  };

  // ------------------ Return JSX ------------------
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ maxWidth: 900, mx: "auto", p: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 4 }}>
          <Button
            variant="outlined"
            color="error"
            onClick={async () => { await auth.signOut(); navigate('/') }}
            sx={{ borderRadius: 2 }}
          >
            Logout
          </Button>
        </Box>

        {/* Dashboard Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" fontWeight="bold">
            {selectedLinkedUser ? `${selectedLinkedUser}'s Dashboard` : "My Prescription Dashboard"}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Button variant="contained" color="secondary" onClick={() => setInviteOpen(true)}>Invite User</Button>
            <FormControl sx={{ minWidth: 250 }}>
              <InputLabel>View Linked User</InputLabel>
              <Select
                value={selectedLinkedUser || ""}
                onChange={(e) => setSelectedLinkedUser(e.target.value)}
              >
                <MenuItem value="">My Dashboard</MenuItem>
                {linkedUsers.map(email => (<MenuItem key={email} value={email}>{email}</MenuItem>))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <Paper sx={{ p: 3, mb: 4 }} elevation={3}>
            <Typography variant="h6" gutterBottom>Pending Invites</Typography>
            {pendingInvites.map(invite => (
              <Box key={invite.id} sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <Typography sx={{ flex: 1 }}>{invite.from} invited you</Typography>
                <Button variant="contained" size="small" color="primary" sx={{ mr: 1 }}
                  onClick={() => acceptInvite(invite.id, invite.from)}>Accept</Button>
                <Button variant="outlined" size="small" color="error"
                  onClick={() => declineInvite(invite.id)}>Decline</Button>
              </Box>
            ))}
          </Paper>
        )}

        {/* Invite Dialog */}
        <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)}>
          <DialogTitle>Invite Linked User</DialogTitle>
          <DialogContent>
            <TextField fullWidth label="User Email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} sx={{ mt: 2 }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={sendInvite} variant="contained">Send Invite</Button>
          </DialogActions>
        </Dialog>

        {/* Prescription Form */}
        {!selectedLinkedUser && (
          <Paper sx={{ p: 3, mb: 4 }} elevation={3}>
            <Typography variant="h6" gutterBottom>Add a New Prescription</Typography>
            <Divider sx={{ mb: 2 }} />
            <TextField fullWidth label="Prescription Name" value={prescription.name}
              onChange={e => setPrescription({ ...prescription, name: e.target.value })} sx={{ mb: 2 }} />
            <TextField fullWidth label="Dosage" value={prescription.dosage}
              onChange={e => setPrescription({ ...prescription, dosage: e.target.value })} sx={{ mb: 2 }} />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Frequency</InputLabel>
              <Select value={prescription.frequency} onChange={e => setPrescription({ ...prescription, frequency: e.target.value })}>
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="every-2-days">Every 2 Days</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
              </Select>
            </FormControl>

            <Typography variant="subtitle1" gutterBottom>Times Per Day</Typography>
            {prescription.timesPerDay.map((time, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TextField type="time" value={time} onChange={e => {
                  const times = [...prescription.timesPerDay]; times[idx] = e.target.value;
                  setPrescription({ ...prescription, timesPerDay: times });
                }} sx={{ mr: 2 }} />
                <Button variant="outlined" color="error" onClick={() => {
                  const filtered = prescription.timesPerDay.filter((_, i) => i !== idx);
                  setPrescription({ ...prescription, timesPerDay: filtered });
                }} disabled={prescription.timesPerDay.length === 1}>Remove</Button>
              </Box>
            ))}
            <Button variant="outlined" onClick={() => setPrescription({ ...prescription, timesPerDay: [...prescription.timesPerDay, '08:00'] })} sx={{ mb: 2 }}>
              Add Time
            </Button>

            <TextField fullWidth label="Start Date" type="date"
              value={prescription.startDate.format('YYYY-MM-DD')}
              onChange={e => setPrescription({ ...prescription, startDate: dayjs(e.target.value) })}
              sx={{ mb: 2 }} InputLabelProps={{ shrink: true }} />

            <TextField fullWidth label="End Date (Optional)" type="date"
              value={prescription.endDate ? prescription.endDate.format('YYYY-MM-DD') : ''}
              onChange={e => setPrescription({ ...prescription, endDate: e.target.value ? dayjs(e.target.value) : null })}
              sx={{ mb: 2 }} InputLabelProps={{ shrink: true }} />

            <Button variant="contained" onClick={handleAddPrescription} sx={{ width: '100%' }}>Add Prescription Reminder</Button>
          </Paper>
        )}

        {/* Weekly Schedule */}
        <Typography variant="h5" sx={{ mb: 2 }}>Weekly Schedule</Typography>
        {daysOfWeek.map((day, idx) => {
          const dateKey = day.format('YYYY-MM-DD');
          return (
            <Paper key={idx} sx={{ mb: 3, p: 3 }} elevation={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6">{day.format('dddd')}</Typography>
                <Typography color="text.secondary">{day.format('MMM D')}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ mt: 1 }}>
                {prescriptions.flatMap(p => {
                  const step = p.frequency === "every-2-days" ? 2 : p.frequency === "weekly" ? 7 : 1;
                  const dayIndex = day.diff(p.startDate, "day");
                  if (dayIndex < 0) return [];
                  if (p.endDate && day.isAfter(p.endDate, "day")) return [];
                  if (dayIndex % step !== 0) return [];

                  return p.timesPerDay.map(time => {
                    const eventKey = `${dateKey}-${p.id}-${time}`;
                    const isTaken = !!takenEvents[eventKey];
                    const isToday = dateKey === todayKey;

                    return (
                      <Box key={eventKey} sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        p: 2, my: 1, borderRadius: 2, boxShadow: 1,
                        backgroundColor: isTaken ? "#c8e6c9" : "#f9f9f9",
                        transition: "background-color 0.25s ease"
                      }}>
                        <Typography variant="body1">{p.name} - {p.dosage} at {time} {isTaken && "✔️"}</Typography>
                        {isToday && !selectedLinkedUser && (
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => toggleTaken(p.id, time, dateKey, `${p.name} - ${p.dosage} at ${time}`)}
                            sx={{ ml: 2, borderRadius: 2 }}
                          >
                            {isTaken ? "Undo" : "Take"}
                          </Button>
                        )}
                      </Box>
                    );
                  });
                })}
                {prescriptions.flatMap(p => {
                  const step = p.frequency === "every-2-days" ? 2 : p.frequency === "weekly" ? 7 : 1;
                  const dayIndex = day.diff(p.startDate, "day");
                  if (dayIndex < 0) return [];
                  if (p.endDate && day.isAfter(p.endDate, "day")) return [];
                  if (dayIndex % step !== 0) return [];
                  return [true];
                }).length === 0 && <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 1 }}>No events for this day.</Typography>}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </LocalizationProvider>
  );
}
