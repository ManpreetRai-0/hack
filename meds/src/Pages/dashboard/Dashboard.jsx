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
  getDocs, doc, updateDoc, setDoc, getDoc, arrayUnion
} from 'firebase/firestore';
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [selectedLinkedUser, setSelectedLinkedUser] = React.useState("");
  const [linkedUsers, setLinkedUsers] = React.useState([]);
  const [pendingInvites, setPendingInvites] = React.useState([]);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [prescriptions, setPrescriptions] = React.useState([]);
  const [takenEvents, setTakenEvents] = React.useState({});
  const [prescriptionForm, setPrescriptionForm] = React.useState({
    name: '',
    dosage: '',
    frequency: 'daily',
    startDate: dayjs(),
    endDate: null,
    timesPerDay: ['08:00']
  });

  const navigate = useNavigate();
  const todayKey = dayjs().format('YYYY-MM-DD');
  const daysOfWeek = [...Array(7)].map((_, i) => dayjs().add(i, 'day'));

  // ------------------ Firebase Fetching ------------------
  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      if (Notification.permission !== 'granted') Notification.requestPermission();

      await fetchPrescriptions();
      await fetchLinkedUsers();
      await checkInvites();
    });

    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    fetchPrescriptions();
  }, [selectedLinkedUser]);

  // ------------------ Prescription Fetching ------------------
  const fetchPrescriptions = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const email = (selectedLinkedUser || user.email).replace(/\./g, '_');
    const prescriptionsRef = collection(db, 'users', email, 'prescriptions');
    const snapshot = await getDocs(prescriptionsRef);

    const fetched = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      fetched.push({
        ...data,
        startDate: dayjs(data.startDate.toDate()),
        endDate: data.endDate ? dayjs(data.endDate.toDate()) : null
      });
    });

    setPrescriptions(fetched);
  };

  const fetchLinkedUsers = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const userDoc = await getDoc(doc(db, 'users', user.email.replace(/\./g, '_')));
    if (userDoc.exists()) {
      setLinkedUsers(userDoc.data().linkedUsers || []);
    }
  };

  // ------------------ Compute Next 7 Days ------------------
  const computeNext7DaysEvents = () => {
    const events = {};

    daysOfWeek.forEach(day => {
      const key = day.format('YYYY-MM-DD');
      events[key] = [];

      prescriptions.forEach(p => {
        const { name, dosage, frequency, startDate, endDate, timesPerDay } = p;
        if (day.isBefore(startDate, 'day')) return;
        if (endDate && day.isAfter(endDate, 'day')) return;

        const step = frequency === 'every-2-days' ? 2 : frequency === 'weekly' ? 7 : 1;
        const diff = day.diff(startDate, 'day');
        if (diff % step === 0) {
          timesPerDay.forEach(time => events[key].push(`${name} - ${dosage} at ${time}`));
        }
      });
    });

    return events;
  };

  const events = computeNext7DaysEvents();

  // ------------------ Add Prescription ------------------
  const savePrescription = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const { name, dosage, frequency, startDate, endDate, timesPerDay } = prescriptionForm;
    if (!name || !dosage || timesPerDay.length === 0) return;

    const sanitizedEmail = user.email.replace(/\./g, '_');
    const prescriptionsRef = collection(db, 'users', sanitizedEmail, 'prescriptions');

    await addDoc(prescriptionsRef, {
      name, dosage, frequency, startDate: startDate.toDate(),
      endDate: endDate ? endDate.toDate() : null,
      timesPerDay
    });

    setPrescriptionForm({ name: '', dosage: '', frequency: 'daily', startDate: dayjs(), endDate: null, timesPerDay: ['08:00'] });
    fetchPrescriptions();
  };

  // ------------------ Invite System ------------------
  const sendInvite = async () => {
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'invitations'), {
      from: user.email,
      to: inviteEmail,
      status: 'pending',
      createdAt: new Date()
    });

    setInviteOpen(false);
    setInviteEmail('');
  };

  const checkInvites = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'invitations'), where('to', '==', user.email), where('status', '==', 'pending'));
    const snapshot = await getDocs(q);

    const invites = [];
    snapshot.forEach(docSnap => invites.push({ id: docSnap.id, ...docSnap.data() }));
    setPendingInvites(invites);
  };

  const acceptInvite = async (inviteId, fromEmail) => {
    const user = auth.currentUser;
    if (!user) return;

    await updateDoc(doc(db, 'invitations', inviteId), { status: 'accepted' });
    await setDoc(doc(db, 'users', fromEmail.replace(/\./g, '_')), { linkedUsers: arrayUnion(user.email) }, { merge: true });
    await setDoc(doc(db, 'users', user.email.replace(/\./g, '_')), { linkedUsers: arrayUnion(fromEmail) }, { merge: true });

    checkInvites();
  };

  const declineInvite = async (inviteId) => {
    await updateDoc(doc(db, 'invitations', inviteId), { status: 'declined' });
    checkInvites();
  };

  // ------------------ UI ------------------
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ maxWidth: 900, mx: 'auto', p: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 4 }}>
          <Button variant="outlined" color="error" onClick={async () => { await auth.signOut(); navigate('/'); }}>
            Logout
          </Button>
        </Box>

        {/* Linked User Selector */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" fontWeight="bold">
            {selectedLinkedUser ? `${selectedLinkedUser}'s Dashboard` : "My Prescription Dashboard"}
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Button variant="contained" color="secondary" onClick={() => setInviteOpen(true)}>Invite User</Button>
            <FormControl sx={{ minWidth: 250 }}>
              <InputLabel>View Linked User</InputLabel>
              <Select value={selectedLinkedUser || ""} onChange={e => setSelectedLinkedUser(e.target.value)}>
                <MenuItem value="">My Dashboard</MenuItem>
                {linkedUsers.map(email => <MenuItem key={email} value={email}>{email}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <Paper sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6">Pending Invites</Typography>
            {pendingInvites.map(invite => (
              <Box key={invite.id} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography sx={{ flex: 1 }}>{invite.from} invited you</Typography>
                <Button variant="contained" size="small" color="primary" sx={{ mr: 1 }} onClick={() => acceptInvite(invite.id, invite.from)}>Accept</Button>
                <Button variant="outlined" size="small" color="error" onClick={() => declineInvite(invite.id)}>Decline</Button>
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
          <Paper sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6" gutterBottom>Add a New Prescription</Typography>
            <Divider sx={{ mb: 2 }} />
            <TextField fullWidth label="Name" value={prescriptionForm.name} onChange={e => setPrescriptionForm({ ...prescriptionForm, name: e.target.value })} sx={{ mb: 2 }} />
            <TextField fullWidth label="Dosage" value={prescriptionForm.dosage} onChange={e => setPrescriptionForm({ ...prescriptionForm, dosage: e.target.value })} sx={{ mb: 2 }} />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Frequency</InputLabel>
              <Select value={prescriptionForm.frequency} onChange={e => setPrescriptionForm({ ...prescriptionForm, frequency: e.target.value })}>
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="every-2-days">Every 2 Days</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="subtitle1">Times Per Day</Typography>
            {prescriptionForm.timesPerDay.map((time, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TextField type="time" value={time} onChange={e => {
                  const times = [...prescriptionForm.timesPerDay]; times[idx] = e.target.value;
                  setPrescriptionForm({ ...prescriptionForm, timesPerDay: times });
                }} sx={{ mr: 2 }} />
                <Button variant="outlined" color="error" disabled={prescriptionForm.timesPerDay.length === 1} onClick={() => {
                  const times = prescriptionForm.timesPerDay.filter((_, i) => i !== idx);
                  setPrescriptionForm({ ...prescriptionForm, timesPerDay: times });
                }}>Remove</Button>
              </Box>
            ))}
            <Button variant="outlined" onClick={() => setPrescriptionForm({ ...prescriptionForm, timesPerDay: [...prescriptionForm.timesPerDay, '08:00'] })} sx={{ mb: 2 }}>Add Time</Button>
            <TextField fullWidth type="date" label="Start Date" value={prescriptionForm.startDate.format('YYYY-MM-DD')} onChange={e => setPrescriptionForm({ ...prescriptionForm, startDate: dayjs(e.target.value) })} sx={{ mb: 2 }} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth type="date" label="End Date" value={prescriptionForm.endDate ? prescriptionForm.endDate.format('YYYY-MM-DD') : ''} onChange={e => setPrescriptionForm({ ...prescriptionForm, endDate: e.target.value ? dayjs(e.target.value) : null })} sx={{ mb: 2 }} InputLabelProps={{ shrink: true }} />
            <Button variant="contained" fullWidth onClick={savePrescription}>Add Prescription Reminder</Button>
          </Paper>
        )}

        {/* Weekly Schedule */}
        <Typography variant="h5" sx={{ mb: 2 }}>Next 7 Days</Typography>
        {daysOfWeek.map(day => {
          const dateKey = day.format('YYYY-MM-DD');
          const dayEvents = events[dateKey] || [];

          return (
            <Paper key={dateKey} sx={{ mb: 3, p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6">{day.format('dddd')}</Typography>
                <Typography color="text.secondary">{day.format('MMM D')}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              {dayEvents.length === 0 && <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 1 }}>No events for this day.</Typography>}
              {dayEvents.map((event, i) => {
                const eventKey = `${dateKey}-${i}`;
                const isTaken = takenEvents[eventKey];
                const isToday = dateKey === todayKey;

                return (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, my: 1, borderRadius: 2, boxShadow: 1, backgroundColor: isTaken ? "#e8f5e9" : "#f9f9f9" }}>
                    <Typography>{event} {isTaken && "✔️"}</Typography>
                    {isToday && !selectedLinkedUser && (
                      <Button variant="contained" size="small" onClick={() => setTakenEvents(prev => ({ ...prev, [eventKey]: !isTaken }))}>
                        {isTaken ? "Taken" : "Mark Taken"}
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Paper>
          );
        })}
      </Box>
    </LocalizationProvider>
  );
}
