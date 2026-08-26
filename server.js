import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import api from './api/index.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.use('/api',api);
app.use(express.static(path.join(__dirname,'dist')));
app.use((req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));
app.listen(3000,()=>console.log('http://localhost:3000'));
