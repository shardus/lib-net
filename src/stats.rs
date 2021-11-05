use super::ring_buffer::{RingBuffer, Stats as RingBufferStats};
use std::{sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
}, time::Duration};

const RING_BUFFER_SIZE: usize = 100;

pub(crate) struct Stats {
    outstanding_sends: Arc<AtomicUsize>,
    outstanding_receives: Arc<AtomicUsize>,
    outstanding_sends_buffer: RingBuffer<usize>,
    outstanding_receives_buffer: RingBuffer<usize>,
}

impl Stats {
    pub(crate) fn new() -> (Self, Incrementers) {
        let outstanding_sends = Arc::new(AtomicUsize::new(0));
        let outstanding_receives = Arc::new(AtomicUsize::new(0));

        (
            Self {
                outstanding_sends: outstanding_sends.clone(),
                outstanding_receives: outstanding_receives.clone(),
                outstanding_sends_buffer: RingBuffer::new(RING_BUFFER_SIZE),
                outstanding_receives_buffer: RingBuffer::new(RING_BUFFER_SIZE),
            },
            Incrementers { outstanding_sends, outstanding_receives },
        )
    }

    pub(crate) fn decrement_outstanding_sends(&mut self) {
        let outstanding = self.outstanding_sends.fetch_sub(1, Ordering::Acquire) - 1;
        self.outstanding_sends_buffer.put(outstanding);
    }

    pub(crate) fn decrement_outstanding_receives(&mut self) {
        let outstanding = self.outstanding_receives.fetch_sub(1, Ordering::Acquire) - 1;
        self.outstanding_receives_buffer.put(outstanding);
    }

    pub(crate) fn put_elapsed_receive(&mut self, elapsed: Duration) {

    }

    pub(crate) fn get_stats(&mut self) -> StatsResult {
        StatsResult {
            outstanding_sends: self.outstanding_sends_buffer.get_stats(),
            outstanding_receives: self.outstanding_receives_buffer.get_stats(),
        }
    }
}

#[derive(Clone)]
pub(crate) struct Incrementers {
    outstanding_sends: Arc<AtomicUsize>,
    outstanding_receives: Arc<AtomicUsize>
}

impl Incrementers {
    pub(crate) fn increment_outstanding_sends(&self) {
        self.outstanding_sends.fetch_add(1, Ordering::Relaxed);
    }

    pub(crate) fn increment_outstanding_receives(&self) {
        self.outstanding_receives.fetch_add(1, Ordering::Relaxed);
    }
}

pub(crate) struct StatsResult {
    outstanding_sends: RingBufferStats<usize>,
    outstanding_receives: RingBufferStats<usize>
}
