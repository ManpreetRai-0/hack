import * as React from 'react';
import {
  Box, Button, Typography, TextField, Paper,
  MenuItem, Select, InputLabel, FormControl
} from '@mui/material';
import dayjs from 'dayjs';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { db } from '../../FIREBASE.env';
import { collection, addDoc } from 'firebase/firestore';

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = React.useState(dayjs());
  const [events, setEvents] = React.useState({});
  const [prescription, setPrescription] = React.useState({
    name: '',
    dosage: '',
    frequency: 'daily',
    startDate: dayjs(),
    endDate: null,
    timesPerDay: ['08:00']
  });

  React.useEffect(() => {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

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

  const savePrescriptionToFirebase = async (prescriptionData, eventsByDate) => {
    try {
      await addDoc(collection(db, 'prescriptions'), {
        ...prescriptionData,
        createdAt: new Date().toISOString(),
        eventsByDate,
      });
    } catch (error) {
      console.error('Error saving to Firebase:', error);
    }
  };

  const handleAddPrescription = () => {
    const { name, dosage, frequency, startDate, endDate, timesPerDay } = prescription;
    if (!name || !dosage || timesPerDay.length === 0) return;

    const updatedEvents = { ...events };

    for (let i = 0; i < 7; i++) {
      const date = startDate.add(i, 'day');
      if (endDate && date.isAfter(endDate, 'day')) continue;

      const dateKey = date.format('YYYY-MM-DD');

      timesPerDay.forEach((time) => {
        const eventDescription = `${name} - ${dosage} at ${time}`;
        if (!updatedEvents[dateKey]) updatedEvents[dateKey] = [];
        updatedEvents[dateKey].push(eventDescription);

        if (Notification.permission === 'granted') {
          const dateTime = dayjs(`${dateKey}T${time}`);
          if (dateTime.isAfter(dayjs())) {
            scheduleNotification('Pill Reminder', eventDescription, dateTime);
          }
        }
      });
    }

    setEvents(updatedEvents);
    savePrescriptionToFirebase(prescription, updatedEvents);

    setPrescription({
      name: '',
      dosage: '',
      frequency: 'daily',
      startDate: dayjs(),
      endDate: null,
      timesPerDay: ['08:00']
    });
  };

  const daysOfWeek = getNextWeekDays(selectedDate);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Prescription Dashboard</Typography>

        {/* Prescription Form */}
        <Box sx={{ width: '100%', mb: 2 }}>
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
              label="Frequency">
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="every-2-days">Every 2 Days</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
            </Select>
          </FormControl>

          {/* Time Inputs */}
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Times Per Day</Typography>
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

          {/* Date Inputs */}
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
        </Box>

        <Button variant="contained" onClick={handleAddPrescription} sx={{ width: '100%', mb: 4 }}>
          Add Prescription Reminder
        </Button>

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
                  {(events[dateKey] || []).map((event, idx) => (
                    <Box key={idx} sx={{ backgroundColor: '#f9f9f9', p: 1, my: 0.5, borderRadius: 1 }}>
                      <Typography variant="body2">{event}</Typography>
                    </Box>
                  ))}
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
