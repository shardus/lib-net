use super::ring_buffer::{RingBuffer, Stats as RingBufferStats};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

const RING_BUFFER_SIZE: usize = 100;

pub(crate) struct Stats {
    pub outstanding_sends_buffer: RingBuffer<usize>,
    pub outstanding_receives_buffer: RingBuffer<usize>,
    pub receive_elapsed_buffer: RingBuffer<Duration>,
    outstanding_sends: Arc<Mutex<AtomicUsize>>,
    outstanding_receives: Arc<Mutex<AtomicUsize>>,
}

impl Stats {
    pub(crate) fn new() -> (Self, Incrementers) {
        let outstanding_sends = Arc::new(Mutex::new(AtomicUsize::new(0)));
        let outstanding_receives = Arc::new(Mutex::new(AtomicUsize::new(0)));

        (
            Self {
                outstanding_sends: outstanding_sends.clone(),
                outstanding_receives: outstanding_receives.clone(),
                outstanding_sends_buffer: RingBuffer::new(RING_BUFFER_SIZE),
                outstanding_receives_buffer: RingBuffer::new(RING_BUFFER_SIZE),
                receive_elapsed_buffer: RingBuffer::new(RING_BUFFER_SIZE),
            },
            Incrementers {
                outstanding_sends,
                outstanding_receives,
            },
        )
    }

    pub(crate) fn decrement_outstanding_sends(&mut self) {
        let lock = self.outstanding_sends.lock().unwrap();
        lock.fetch_add(1, Ordering::Relaxed);
    }

    pub(crate) fn decrement_outstanding_receives(&mut self) {

        let lock = self.outstanding_receives.lock().unwrap();
        let outstanding = lock.fetch_sub(1, Ordering::Acquire) - 1;
        self.outstanding_receives_buffer.put(outstanding);

        // let outstanding = self.outstanding_receives.fetch_sub(1, Ordering::Acquire) - 1;
        // self.outstanding_receives_buffer.put(outstanding);
    }

    pub(crate) fn put_elapsed_receive(&mut self, elapsed: Duration) {
        self.receive_elapsed_buffer.put(elapsed);
    }

    pub(crate) fn get_stats(&mut self) -> StatsResult {
        StatsResult {
            outstanding_sends: self.outstanding_sends_buffer.get_stats(),
            outstanding_receives: self.outstanding_receives_buffer.get_stats(),
            receive_elapsed: self.receive_elapsed_buffer.get_stats(),
        }
    }
}

#[derive(Clone)]
pub(crate) struct Incrementers {
    outstanding_sends: Arc<Mutex<AtomicUsize>>,
    outstanding_receives: Arc<Mutex<AtomicUsize>>,
}

impl Incrementers {
    pub(crate) fn increment_outstanding_sends(&self) {
        let lock = self.outstanding_sends.lock().unwrap();
        lock.fetch_add(1, Ordering::Relaxed);
    }

    pub(crate) fn increment_outstanding_receives(&self) {
        let lock = self.outstanding_receives.lock().unwrap();
        lock.fetch_add(1, Ordering::Relaxed);
    }
}

pub(crate) struct StatsResult {
    pub outstanding_sends: RingBufferStats<usize>,
    pub outstanding_receives: RingBufferStats<usize>,
    pub receive_elapsed: RingBufferStats<Duration>,
}
