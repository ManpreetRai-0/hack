import * as React from 'react';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { Box, Button, Typography, TextField, Paper, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import dayjs from 'dayjs';

export default function Dashboard() {
  // Track the selected date and the events for each day of the week
  const [selectedDate, setSelectedDate] = React.useState(dayjs());
  const [events, setEvents] = React.useState({}); // Store events for each day (by day index)
  const [newEvent, setNewEvent] = React.useState(''); // Track the current event being added
  const [prescription, setPrescription] = React.useState({
    name: '',
    dosage: '',
    frequency: 'daily', // default frequency
    startDate: dayjs(),
    endDate: null, // End date is optional
  });

  // Handle week change (navigate previous or next week)
  const changeWeek = (direction) => {
    const newDate = selectedDate.add(direction, 'week');
    setSelectedDate(newDate);
  };

  // Get the days of the week, starting from today and including the next 6 days
  const getNextWeekDays = (date) => {
    return [...Array(7)].map((_, index) => date.add(index, 'day'));
  };

  // Handle adding events to a specific day
  const handleAddEvent = (dayIndex) => {
    if (newEvent.trim() === '') return; // Don't add empty events
    setEvents((prevEvents) => {
      const updatedEvents = { ...prevEvents };
      if (!updatedEvents[dayIndex]) updatedEvents[dayIndex] = [];
      updatedEvents[dayIndex].push(newEvent);
      return updatedEvents;
    });
    setNewEvent(''); // Reset event input after adding
  };

  // Calculate days to add the prescription reminder based on frequency
  const calculatePrescriptionDays = () => {
    const days = [];
    const { frequency, startDate, endDate } = prescription;

    if (frequency === 'daily') {
      // Daily: add the reminder to every day
      days.push(...Array.from({ length: 7 }, (_, index) => index));
    } else if (frequency === 'every-2-days') {
      // Every 2 days: start from the start date and add every second day
      let nextDate = startDate;
      for (let i = 0; i < 7; i++) {
        if (nextDate.isSame(startDate, 'day') || nextDate.diff(startDate, 'day') % 2 === 0) {
          days.push(i);
        }
        nextDate = nextDate.add(1, 'day');
      }
    } else if (frequency === 'weekly') {
      // Weekly: add the reminder to the same day of the week each week
      const startDayIndex = startDate.day();
      days.push(startDayIndex);
    }

    // If end date is set, filter out days beyond the end date
    if (endDate) {
      const endIndex = endDate.diff(startDate, 'day');
      return days.filter(day => day <= endIndex);
    }

    return days;
  };

  // Add the prescription reminder to the days
  const handleAddPrescription = () => {
    const { name, dosage, frequency, startDate, endDate } = prescription;
    if (!name || !dosage) return; // Ensure name and dosage are provided

    const prescriptionDays = calculatePrescriptionDays();
    prescriptionDays.forEach((dayIndex) => {
      const eventDescription = `${name} - ${dosage}`;
      setEvents((prevEvents) => {
        const updatedEvents = { ...prevEvents };
        if (!updatedEvents[dayIndex]) updatedEvents[dayIndex] = [];
        updatedEvents[dayIndex].push(eventDescription);
        return updatedEvents;
      });
    });

    // Reset prescription inputs after adding
    setPrescription({ name: '', dosage: '', frequency: 'daily', startDate: dayjs(), endDate: null });
  };

  // Get the next 7 days starting from the selected date (current day + 6 future days)
  const daysOfWeek = getNextWeekDays(selectedDate);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
        {/* Header Section */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 2 }}>
          <Typography variant="h6">Week View</Typography>
          <Button 
            variant="contained" 
            onClick={() => changeWeek(-1)} 
            sx={{ width: '150px' }}
          >
            Previous Week
          </Button>
          <Button 
            variant="contained" 
            onClick={() => changeWeek(1)} 
            sx={{ width: '150px' }}
          >
            Next Week
          </Button>
        </Box>

        {/* Input fields for Prescription */}
        <Box sx={{ width: '100%', mb: 2 }}>
          <TextField
            fullWidth
            variant="outlined"
            label="Prescription Name"
            value={prescription.name}
            onChange={(e) => setPrescription({ ...prescription, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            variant="outlined"
            label="Dosage"
            value={prescription.dosage}
            onChange={(e) => setPrescription({ ...prescription, dosage: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Frequency</InputLabel>
            <Select
              value={prescription.frequency}
              onChange={(e) => setPrescription({ ...prescription, frequency: e.target.value })}
              label="Frequency"
            >
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="every-2-days">Every 2 Days</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            variant="outlined"
            label="Start Date"
            type="date"
            value={prescription.startDate.format('YYYY-MM-DD')}
            onChange={(e) => setPrescription({ ...prescription, startDate: dayjs(e.target.value) })}
            sx={{ mb: 2 }}
            InputLabelProps={{
              shrink: true,
            }}
          />
          <TextField
            fullWidth
            variant="outlined"
            label="End Date (Optional)"
            type="date"
            value={prescription.endDate ? prescription.endDate.format('YYYY-MM-DD') : ''}
            onChange={(e) => setPrescription({ ...prescription, endDate: e.target.value ? dayjs(e.target.value) : null })}
            sx={{ mb: 2 }}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </Box>

        {/* Add Prescription Reminder Button */}
        <Box sx={{ mb: 2 }}>
          <Button
            variant="contained"
            onClick={handleAddPrescription}
            sx={{ width: '100%' }}
          >
            Add Prescription Reminder
          </Button>
        </Box>

        {/* Days of the Week (Custom Layout) */}
        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          {daysOfWeek.map((day, index) => (
            <Paper key={index} sx={{ mb: 2, p: 2, borderRadius: '8px', boxShadow: 3, backgroundColor: day.isSame(dayjs(), 'day') ? '#d1e7dd' : '#ffffff' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">{day.format('dddd')}</Typography>
                <Typography variant="body1">{day.format('MMM D')}</Typography>
              </Box>
              <Box sx={{ marginTop: 1 }}>
                <Typography variant="subtitle1" sx={{ marginBottom: 1 }}>Events:</Typography>
                {events[index] && events[index].length > 0 ? (
                  events[index].map((event, idx) => (
                    <Box key={idx} sx={{ backgroundColor: '#f0f0f0', padding: 1, marginBottom: 1, borderRadius: 4 }}>
                      <Typography variant="body2">{event}</Typography>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" sx={{ fontStyle: 'italic' }}>No events for this day.</Typography>
                )}
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
