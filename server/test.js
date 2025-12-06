import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import axios from "axios";
import { readFileSync } from "fs";
const headers = { headers: { Authorization: `Bearer ${process.env.API_KEY}` } };

const API_BASE_URL = process.env.API_BASE_URL;
const url = `${API_BASE_URL}/chats/1701935/chat_messages`;
// axios.get(url, headers).then((response) => {
//   console.log(response.data);
// }).catch((error) => {
//   console.log(error);
// });

axios
  .post(
    url,
    {
      message: {
        attachments: [
          {
            data_base64: readFileSync("../alex-generated-min.png", "base64"),
            filename: "image.jpg",
            mime_type: "image/jpeg",
          },
        ],
        text: "*drums playing*",
      },
    },
    headers
  )
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.log(error);
  });

// const url2 = `${API_BASE_URL}/i_message_availability/check`;
// axios.post(url2, {phone_number: "+19342559239"}, {headers: {Authorization: `Bearer ${process.env.API_KEY}`}}).then((response) => {
//   console.log(response.data);
// }).catch((error) => {
//   console.log(error);
// });

// group chat
// const url3 = `${API_BASE_URL}/chats`;
// const body3 = {
//   chat: {
//     display_name: "TEST",
//     phone_numbers: [
//       "+19342559239",
//       // "+19342463396"
//       // "+15102055337"
//     ],
//   },
//   message: {
//     text: "Hello",
//   },
//   send_from: process.env.SENDER_NUMBER,
// };
// axios
//   .post(url3, body3, headers)
//   .then((response) => {
//     console.log(response.data);
//   })
//   .catch((error) => {
//     console.log(error);
//   });
