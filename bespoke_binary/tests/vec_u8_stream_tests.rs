#[cfg(test)]
mod tests {
    // use super::*;
    use bespoke_binary::VecU8Stream;

    #[test]
    fn test_write_and_read_u8() {
        let mut stream = VecU8Stream::new(Vec::new());
        stream.write(42_u8);
        let value = stream.read::<u8>().unwrap();
        assert_eq!(value, 42);
    }

    #[test]
    fn test_write_and_read_string() {
        let mut stream = VecU8Stream::new(Vec::new());
        stream.write_string("hello");
        let value = stream.read_string().unwrap();
        assert_eq!(value, "hello");
    }

    #[test]
    fn test_write_and_read_buffer() {
        let mut stream = VecU8Stream::new(Vec::new());
        let buffer = [1, 2, 3, 4];
        stream.write_buffer(&buffer);
        let value = stream.read_buffer().unwrap();
        assert_eq!(value, buffer);
    }

    #[test]
    fn test_write_and_read_array() {
        let mut stream = VecU8Stream::new(Vec::new());
        let array = [10, 20, 30, 40];
        stream.write_array(&array);
        let value = stream.read_array::<i32, 4>().unwrap();
        assert_eq!(value, array);
    }

    #[test]
    fn test_read_past_end() {
        let data = vec![1, 2, 3];
        let mut stream = VecU8Stream::new(data);
        stream.cursor = 3; // Set the cursor past the end of data
        let value: Option<u8> = stream.read();
        assert_eq!(value, None);
    }

    #[test]
    fn test_read_string_past_end() {
        let data = vec![4, 0, 0, 0]; // Represents a string with length 4
        let mut stream = VecU8Stream::new(data);
        let value: Option<String> = stream.read_string();
        assert_eq!(value, None);
    }

    #[test]
    fn test_write_and_read_i16() {
        let mut stream = VecU8Stream::new(Vec::new());
        stream.write(-123_i16);
        let value = stream.read::<i16>().unwrap();
        assert_eq!(value, -123);
    }

    #[test]
    fn test_write_and_read_u32() {
        let mut stream = VecU8Stream::new(Vec::new());
        stream.write(456789_u32);
        let value = stream.read::<u32>().unwrap();
        assert_eq!(value, 456789);
    }

    #[test]
    fn test_write_and_read_i64() {
        let mut stream = VecU8Stream::new(Vec::new());
        stream.write(-987654321_i64);
        let value = stream.read::<i64>().unwrap();
        assert_eq!(value, -987654321);
    }

    #[test]
    fn test_write_and_read_f32() {
        let mut stream = VecU8Stream::new(Vec::new());
        stream.write(3.14159_f32);
        let value = stream.read::<f32>().unwrap();
        assert_eq!(value, 3.14159);
    }

    #[test]
    fn test_write_and_read_f64() {
        let mut stream = VecU8Stream::new(Vec::new());
        stream.write(2.71828_f64);
        let value = stream.read::<f64>().unwrap();
        assert_eq!(value, 2.71828);
    }
}
