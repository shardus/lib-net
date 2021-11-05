use std::iter::Sum;

pub(crate) struct RingBuffer<T> {
    buffer: Vec<T>,
    long_term_max: Option<T>,
    long_term_min: Option<T>,
}

impl<T> RingBuffer<T> {
    pub(crate) fn new(size: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(size),
            long_term_max: None,
            long_term_min: None,
        }
    }

    pub(crate) fn put(&mut self, value: T)
    where
        T: Ord + Copy,
    {
        self.buffer.push(value);

        let new_max = (*self.long_term_max.get_or_insert(value)).max(value);
        self.long_term_max.insert(new_max);

        let new_min = (*self.long_term_min.get_or_insert(value)).min(value);
        self.long_term_min.insert(new_min);
    }

    pub(crate) fn get_stats(&mut self) -> Stats<T>
    where
        T: Default + Copy + Ord + Sum<T>
    {
        let total = self.buffer.iter().cloned().sum::<T>();
        let count = self.buffer.len();

        Stats {
            long_term_max: self.long_term_max.unwrap_or_default(),
            long_term_min: self.long_term_min.unwrap_or_default(),
            min: self.buffer.iter().min().cloned().unwrap_or_default(),
            max: self.buffer.iter().max().cloned().unwrap_or_default(),
            total,
            count
        }
    }
}

pub(crate) struct Stats<T> {
    long_term_max: T,
    long_term_min: T,
    min: T,
    max: T,
    total: T,
    count: usize
}