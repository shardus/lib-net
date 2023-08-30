pub struct CustomBuffer {
    data: Vec<u8>,
    pub cursor: usize,
}

impl CustomBuffer {
    #[allow(dead_code)]
    pub fn new(data: Vec<u8>) -> Self {
        CustomBuffer { data, cursor: 0 }
    }

    #[allow(dead_code)]
    pub fn read<T: std::marker::Copy>(&mut self) -> Option<T> {
        if self.cursor + std::mem::size_of::<T>() <= self.data.len() {
            let value: T = unsafe { std::ptr::read(self.data.as_ptr().offset(self.cursor as isize) as *const T) };
            self.cursor += std::mem::size_of::<T>();
            Some(value)
        } else {
            None
        }
    }

    #[allow(dead_code)]
    pub fn write<T: std::marker::Copy>(&mut self, value: T) {
        let value_bytes: &[u8] = unsafe { std::slice::from_raw_parts(&value as *const T as *const u8, std::mem::size_of::<T>()) };
        self.data.extend_from_slice(value_bytes);
    }

    #[allow(dead_code)]
    pub fn write_string(&mut self, s: &str) {
        let bytes = s.as_bytes();
        self.write::<usize>(bytes.len()); // write the length
        self.data.extend_from_slice(bytes); // write the bytes
    }

    #[allow(dead_code)]
    pub fn read_string(&mut self) -> Option<String> {
        let len = self.read::<usize>()?; // read the length
        if self.cursor + len <= self.data.len() {
            let bytes = &self.data[self.cursor..self.cursor + len];
            self.cursor += len;
            Some(String::from_utf8_lossy(bytes).into_owned())
        } else {
            None
        }
    }

    #[allow(dead_code)]
    pub fn write_buffer(&mut self, buf: &[u8]) {
        self.write::<usize>(buf.len()); // write the length
        self.data.extend_from_slice(buf); // write the buffer data
    }

    #[allow(dead_code)]
    pub fn read_buffer(&mut self) -> Option<Vec<u8>> {
        let len = self.read::<usize>()?; // read the length
        if self.cursor + len <= self.data.len() {
            let bytes = &self.data[self.cursor..self.cursor + len].to_vec();
            self.cursor += len;
            Some(bytes.clone())
        } else {
            None
        }
    }

    #[allow(dead_code)]
    pub fn write_array<T: std::marker::Copy, const N: usize>(&mut self, values: &[T; N]) {
        for value in values.iter() {
            self.write(*value);
        }
    }

    #[allow(dead_code)]
    pub fn read_array<T: std::marker::Copy, const N: usize>(&mut self) -> Option<[T; N]> {
        let mut result: [T; N] = unsafe { std::mem::MaybeUninit::uninit().assume_init() };
        for i in 0..N {
            result[i] = self.read()?;
        }
        Some(result)
    }
}
