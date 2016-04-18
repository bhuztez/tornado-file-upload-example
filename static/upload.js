var input_elem;
var done_elem;
var loaded_elem;
var result_elem;
var BLOCK_SIZE = 1024 * 1024;
var PARALLEL = 5;
var MAX_RETRY = 10;

function sum(array){
    var s = 0;
    for(var i in array){
        s += array[i];
    }
    return s;
}

function upload(){
    var file = input_elem.files[0];
    input_elem.disabled = "disabled";
    done_elem.max = file.size;
    loaded_elem.max = file.size;

    function progress(done,loaded,size){
        done_elem.value = done;
        loaded_elem.value = done + loaded;
    }

    new Promise(
        function(resolve,reject){
            var path = "/upload/" + file.name;
            var size = file.size;
            var next = 0;
            var workers = [];
            var loaded = [];
            var requests = [];
            var done = 0;

            for(var i=0;i<PARALLEL;++i){
                workers.push(i);
                loaded.push(0);
                requests.push(null);
            }

            function continue_upload(){
                while((next < size) && (workers.length > 0)){
                    next += BLOCK_SIZE;
                    var worker = workers.shift();
                    loaded[worker] = 0;
                    upload_block(worker, next-BLOCK_SIZE, 0);
                }

                if((next >= size) && (workers.length === PARALLEL)){
                    resolve();
                }
            }

            function upload_success(worker){
                loaded[worker] = 0;
                done += BLOCK_SIZE;
                progress(done,sum(loaded),size);
                workers.push(worker);
                continue_upload();
            }

            function upload_failure(worker, pos, retry){
                loaded[worker] = 0;
                if (retry < MAX_RETRY){
                    upload_block(worker,pos, retry + 1);
                } else {
                    for(var i=0;i<PARALLEL;++i){
                        if(requests[i] === null){
                            continue;
                        }

                        requests[i].abort();
                    }

                    reject();
                }
            }

            function upload_block(worker, pos, retry){
                var req = new XMLHttpRequest();
                requests[worker] = req;
                req.open("PUT", path);

                var end = pos + BLOCK_SIZE;
                if (end > size)
                    end = size;

                req.setRequestHeader("Content-Range", "bytes " + pos + "-" + (end - 1) + "/" + size);

                req.upload.addEventListener(
                    'progress',
                    function(event){
                        loaded[worker] = event.loaded;
                    }
                );

                req.addEventListener(
                    'load',
                    function(){
                        if(req.status === 200){
                            upload_success(worker);
                        }else{
                            upload_failure(worker, pos, retry);
                        }
                    }
                );

                req.addEventListener(
                    'error',
                    function(){
                        upload_failure(worker, pos, retry);
                    }
                );

                req.send(file.slice(pos,end));
            }

            continue_upload();
        }
    ).then(
        function(){
            result.appendChild(document.createTextNode("upload finished: "));
            var link = document.createElement("a");
            link.href = "/files/" + file.name;
            link.appendChild(document.createTextNode(file.name));
            result.appendChild(link);
            result.appendChild(document.createElement("br"));
            input_elem.disabled = "";
        },
        function(){
            result.appendChild(document.createTextNode("upload failed: " + file.name));
            result.appendChild(document.createElement("br"));
            input_elem.disabled = "";
        }
    );
}

window.addEventListener(
    "load",
    function(){
        input_elem = document.getElementById("input");
        done_elem = document.getElementById("done");
        loaded_elem = document.getElementById("loaded");
        result_elem = document.getElementById("result");
        input_elem.addEventListener('change', upload);
    });
