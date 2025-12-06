import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import axios from 'axios';
const headers = {headers: {Authorization: `Bearer ${process.env.API_KEY}`}}

const API_BASE_URL = process.env.API_BASE_URL;
const url = `${API_BASE_URL}/chats/1701935/chat_messages`;
// axios.get(url, headers).then((response) => {
//   console.log(response.data);
// }).catch((error) => {
//   console.log(error);
// });

// axios.post(url, {message: {
//   attachments: [
//     {
//       "data_base64": "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",
//       "filename": "image.jpg",
//       "mime_type": "image/jpeg"
//     }
//   ],
//   text: "*drums playing*"
// }}, headers).then((response) => {
//   console.log(response.data);
// }).catch((error) => {
//   console.log(error);
// });

// const url2 = `${API_BASE_URL}/i_message_availability/check`;
// axios.post(url2, {phone_number: "+19342559239"}, {headers: {Authorization: `Bearer ${process.env.API_KEY}`}}).then((response) => {
//   console.log(response.data);
// }).catch((error) => {
//   console.log(error);
// });


// group chat
const url3 = `${API_BASE_URL}/chats`;
const body3 = {
  "chat": {
    "display_name": "TEST",
    "phone_numbers": [
      "+19342559239",
      // "+19342463396"
      // "+15102055337"
    ]
  },
  "message": {
    "text": "Hello"
  },
  "send_from": process.env.SENDER_NUMBER
};
axios.post(url3, body3, headers).then((response) => {
  console.log(response.data);
}).catch((error) => {
  console.log(error);
});