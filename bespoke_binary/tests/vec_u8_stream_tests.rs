#[cfg(test)]
mod tests {
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

    //create a test that writes a struct to the stream and then reads it back
    #[test]
    fn test_write_and_read_struct() {
        #[derive(Debug, PartialEq)]
        struct MyStruct {
            a: u8,
            b: i16,
            c: u32,
            d: i64,
            e: f32,
            f: f64,
        }

        let mut stream = VecU8Stream::new(Vec::new());
        let my_struct = MyStruct {
            a: 1,
            b: -2,
            c: 3,
            d: -4,
            e: 5.0,
            f: -6.0,
        };
        stream.write(my_struct.a);
        stream.write(my_struct.b);
        stream.write(my_struct.c);
        stream.write(my_struct.d);
        stream.write(my_struct.e);
        stream.write(my_struct.f);
        let value = MyStruct {
            a: stream.read().unwrap(),
            b: stream.read().unwrap(),
            c: stream.read().unwrap(),
            d: stream.read().unwrap(),
            e: stream.read().unwrap(),
            f: stream.read().unwrap(),
        };
        assert_eq!(value, my_struct);
    }

    //create a test that writes a struct to the stream and then reads it back.  a buffer should be the first field. should also have a string
    #[test]
    fn test_write_and_read_struct_with_buffer_and_string() {
        #[derive(Debug, PartialEq)]
        struct MyStruct {
            a: Vec<u8>,
            b: String,
            c: u8,
        }

        let mut stream = VecU8Stream::new(Vec::new());
        let my_struct = MyStruct {
            a: vec![1, 2, 3],
            b: "hello".to_string(),
            c: 4,
        };
        stream.write_buffer(&my_struct.a);
        stream.write_string(&my_struct.b);
        stream.write(my_struct.c);
        let value = MyStruct {
            a: stream.read_buffer().unwrap(),
            b: stream.read_string().unwrap(),
            c: stream.read().unwrap(),
        };
        //value.c = 88;
        assert_eq!(value, my_struct);

        //print the hex contents of the stream
        println!("{:x?}", stream.data);
    }
}
