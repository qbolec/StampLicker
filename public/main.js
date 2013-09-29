var module=StampsLickerModule(window,function(config){
  new Request.JSONP({
    method:config.method,
    url:config.url,
    data:config.data,
    onFailure:config.failure,
    onSuccess:config.success
  }).send();
},MersenneTwister,function(text){return CryptoJS.SHA1(text).words[4]>>>0;});

var domain_licker = new module.DomainStampsLicker({
  verifier_endpoint:'http://vanisoft.pl:8801/verify',
  domain:'strupa',
  //do not change these numbers unless you read the paper
  n:23,//length in bits of each x, v[i], and w[i], and 2^n is the size of t[]
  e:23,//2^e is the expected number of trials before we find checksum with e zeros. e must not be smaller than n
  repetitions:6,//number of stamps to be generated. repetitions*2^e is the workload for client. Too minimize variance of the overall workload keep it larger than 5
  l:35,//length of the path b[1],..,b[l], and  x[0],...,x[l], suggested to be e+10
});

$('send').addEvent('click',function(){
  var stamp_licker = domain_licker.getStampLicker('send/from:john/to:marry' + (+new Date()));
  stamp_licker.lick({
    on_success:function(proof){$('result').set('text',"Full success, the proof is \n" + JSON.encode(proof));},
    on_failure:function(err){console.log("An error occured",err);}
  });
});
