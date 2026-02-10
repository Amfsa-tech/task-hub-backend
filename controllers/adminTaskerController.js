import Tasker from '../models/tasker.js';

export const getAllTaskers = async (req, res) => {
  const taskers = await Tasker.find().sort({ createdAt: -1 });
  res.json({ status: 'success', taskers });
};

export const getTaskerById = async (req, res) => {
  const tasker = await Tasker.findById(req.params.id);
  if (!tasker) {
    return res.status(404).json({ message: 'Tasker not found' });
  }
  res.json({ status: 'success', tasker });
};

export const verifyTasker = async (req, res) => {
  const tasker = await Tasker.findById(req.params.id);
  if (!tasker) {
    return res.status(404).json({ message: 'Tasker not found' });
  }

  tasker.isVerified = true;
  await tasker.save();

  res.json({ status: 'success', message: 'Tasker verified' });
};

export const suspendTasker = async (req, res) => {
  const tasker = await Tasker.findById(req.params.id);
  if (!tasker) {
    return res.status(404).json({ message: 'Tasker not found' });
  }

  tasker.isActive = false;
  await tasker.save();

  res.json({ status: 'success', message: 'Tasker suspended' });
};