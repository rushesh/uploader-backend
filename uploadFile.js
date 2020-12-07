const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
var vidStreamer = require("vid-streamer");
var morgan = require('morgan')
const PORT = process.env.PORT | 3000;
const app = express();

var multer  = require('multer'); 
const util = require('util'); 
const fsp = { 
  readdir: util.promisify(fs.readdir), 
  readFile: util.promisify(fs.readFile), 
  writeFile: util.promisify(fs.writeFile), 
  unlink: util.promisify(fs.unlink), 
}; 


// app.use(morgan('dev'));
app.use(cors({origin: '*'}));
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/videos/", vidStreamer);

var server = app.listen(PORT, ()=> { 
  var host = server.address().address 
  var port = server.address().port 
  console.log("Example app listening at http://%s:%s", host, port) 
}) 

let uploads = {};

// app.post('/videofilesadd',(req,res)=>{
//   console.log('in /videofilesadd : ');
//   console.log('req.file : '+ JSON.stringify(req.files));
//   res.status(201).send({'uploaded': 1});
// })


// app.post('/videofilesremove',(req,res)=>{
//   console.log('in /videofilesremove : ');
//   console.log('req.file : '+ JSON.stringify(req.files));
//   res.status(200).send({'uploaded': 1});
// })

app.get('/getvideos',(req,res)=>{
  fs.readdir('videos',(err,files)=>{
    if(err){
      return res.send({'videos':[],'error':{'message':error.message}})
    }
    else
    {
      if(files.length==0){
       return res.send({'videos':[]})
      }
      return res.send({'videos':files});
    }
  })
})

app.get('/getvideosupload',(req,res)=>{
  fs.readdir('uploads',(err,files)=>{
    if(err){
      return res.send({'videos':[],'error':{'message':error.message}})
    }
    else
    {
      if(files.length==0){
       return res.send({'videos':[]})
      }
      return res.send({'videos':files});
    }
  })
})

app.get('/getvideo',(req,res)=>{
console.log("in get video: " + req.query.filename);

  fs.readdir('videos',(err,files)=>{
    if(err){
      return res.send({'videos':[],'error':{'message':error.message}})
    }
    else
    {
      files.forEach((file)=>{
        console.log('File : '+file);
        if(file.toLowerCase() == req.query.filename.toLowerCase()){
          const path = 'videos/'+file;
          console.log('Path : '+path);
  const stat = fs.statSync(path)
  const fileSize = stat.size
  const range = req.headers.range
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] 
      ? parseInt(parts[1], 10)
      : fileSize-1
    const chunksize = (end-start)+1
    const file = fs.createReadStream(path, {start, end})
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(200, head)
    fs.createReadStream(path).pipe(res)
  }
        }
      })
     // return res.send({'videos':files});
    }
  })
})

app.post('/upload', (req, res, next) => {
    let fileId = req.headers['x-file-id'];
    let startByte = parseInt(req.headers['x-start-byte'], 10);
    let name = req.headers['name'];
    let fileSize = parseInt(req.headers['size'], 10);
    console.log('file Size',fileSize, fileId, startByte);
    if(uploads[fileId] && fileSize == uploads[fileId].bytesReceived){
      res.end();
      return; 
    }

    console.log(fileSize);

    if (!fileId) {
        res.writeHead(400, "No file id");
        res.end(400);
    }
    console.log(uploads[fileId]);
    if (!uploads[fileId]) 
        uploads[fileId] = {};

    let upload = uploads[fileId];

    let fileStream;

    if(!startByte){
        upload.bytesReceived = 0;
        let name = req.headers['name'];
        fileStream = fs.createWriteStream(`./videos/${name}`, {
          flags: 'w'
        });
    }else{
        if (upload.bytesReceived != startByte) {
            res.writeHead(400, "Wrong start byte");
            res.end(upload.bytesReceived);
            return;
          }
          // append to existing file
          fileStream = fs.createWriteStream(`./videos/${name}`, {
            flags: 'a'
          });
    }

    req.on('data', function(data) {
        //console.log("bytes received", upload.bytesReceived);
        upload.bytesReceived += data.length;
      });
  
      req.pipe(fileStream);
    
      // when the request is finished, and all its data is written
      fileStream.on('close', function() {
        console.log(upload.bytesReceived, fileSize);
        if (upload.bytesReceived == fileSize) {
          console.log("Upload finished");
          delete uploads[fileId];
    
          // can do something else with the uploaded file here
          res.send({'status': 'uploaded'});
          res.end();
        } else {
          // connection lost, we leave the unfinished file around
          console.log("File unfinished, stopped at " + upload.bytesReceived);
          res.writeHead(500, "Server Error");
          res.end();
        }
      });
    
      // in case of I/O error - finish the request
      fileStream.on('error', function(err) {
        console.log("fileStream error", err);
        res.writeHead(500, "File error");
        res.end();
      });
    
  });

app.get('/status', (req, res) =>{
    //console.log('came');
    let fileId = req.headers['x-file-id'];
    let name = req.headers['name'];
    let fileSize = parseInt(req.headers['size'], 10);
    console.log(name);
    if(name){
      try{
        let stats = fs.statSync('videos/' +  name);
        if(stats.isFile())
        {
          console.log(`fileSize is ${fileSize} and already uploaded file size ${stats.size}`);
          if(fileSize == stats.size){
            res.send({'status': 'This video is already present.', "uploaded" : stats.size, "isUploadAlready":100})
            return;
          }
          if(!uploads[fileId])
            uploads[fileId] = {}
          console.log(uploads[fileId]);
          uploads[fileId]['bytesReceived'] = stats.size;
          console.log(uploads[fileId], stats.size);
        }
      }catch(er){

      }
      
    }
    let upload = uploads[fileId];
    if(upload)
        res.send({"uploaded" : upload.bytesReceived});
    else
        res.send({"uploaded" : 0});
    
});

var isChunk = false; 
var i = 0; 
var tempFileName = ""; 
var fileformat; 
var tempName = ""; 
var storage = multer.diskStorage({  
  destination: function (req, file, callback){  
    callback(null, './uploads');   
  },  
  filename: function (req,file, callback) { 
    console.log(" In Multer" + JSON.stringify(req.files) + req.files[0] + req.files[0].fieldname);
    if (req.files[0] != null &&  req.files[0].fieldname=="chunkFile"){ 
      // For ChunkUpload 
      fileformat = file.originalname.split('.'); 
      tempFileName = fileformat[0]+"-"+i+"."+fileformat[fileformat.length-1]+'.part'; 
      console.log(file.originalname+ " #### " + tempFileName);
      // let stats = fs.statSync('uploads/' +  file.originalname);
      // console.log("stats : "+ file.originalname);
      // if(stats.isFile()){
      //   callback('File already exists',null);
      // }
      // fs.readdir('uploads',(err,files)=>{
      //     if(files.length==0){
           
      //     }
      //     else{
      //     files.forEach((file)=>{
      //       if(file.toLowerCase() == tempFileName.toLowerCase()){              
      //           return res.status(400).send({'error':{'message':'This file already exists!'}});
      //       }
      //     })  
      //     }
      //   })
      // Saving all chunks as file with extension .part 
      callback(null,tempFileName) 
      i++; 
    }  
    // else 
    // For Normal upload 
    // callback(null, file.originalname); 
  }  
 })  
   
var upload = multer({ storage : storage});

app.post('/videofilesremove',upload.array('chunkFile', 12), (err, req, res) => { 
  if(err){
    console.log('Err : '+err);
  }
   console.log("Got a Post request for the remove"); 
    // Delete the file like normal
    console.log(JSON.stringify(req.files[0]));
   //fs.unlinkSync(req.files[0].path) 
   res.send('POST method called'); 
 }) 

// Field name need to be changed for chunk and normal uploads respectively. 
app.post('/videofilesadd',upload.array('chunkFile', 12), (req, res) => { 
  console.log('in Video File Add');
    isChunk = parseInt(req.body.chunkIndex) < parseInt(req.body.totalChunk-1) ? true : false; 
    if (tempFileName != "" && tempName != "" && !isChunk) {
        tempFileName = ""; 
        i = 0; 
        // merging all .part files 
        (async () => { 
          const read = file => new Promise((a, b) => 
            fs.createReadStream(file). 
              on('data', a => ws.write(a)). 
              on('end', a).on('error', b) 
          ); 
          const files = (await fsp.readdir('./uploads')).filter(a => a.endsWith('.part')); 
          const ws = fs.createWriteStream('./uploads/'+req.files[0].originalname); 
          // Deleting .part files  
          for(const file of files){ 
            await read('./uploads/'+file); 
            await fsp.unlink('./uploads/'+file); 
          } 
          ws.end(); 
        })().catch(console.log); 
         
    } 
    else { 
      tempName = tempFileName; 
    } 
    console.log("Got a POST request for the homepage"); 
    res.send('POST method called'); 
 }) 
