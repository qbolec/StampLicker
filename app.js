var port = 8801;
var express = require('express');
var url = require('url');
var _ = require('underscore');
var crypto = require('crypto');
var mersenne = require('mersenne');
var app = express();
app.use(express.static(__dirname + '/public'));
var domains = {};
var domains_mru = [];
var MAX_DOMAINS_MRU_LENGTH=10;
function rot(x,bits,e){
  bits%=e;
  return ((x>>>(e-bits))|(x<<bits))>>>0;
}
function sha1_last_u32(text){
  var shasum = crypto.createHash('sha1');
  shasum.update(text);
  return ('0x'+shasum.digest('hex').slice(-8))>>>0;
}
function sign(domain_info,arr){
  var shasum = crypto.createHash('sha1');
  var domain_secret = domain_info.secret;
  shasum.update(arr.join('|') + '|' + domain_secret);
  return shasum.digest('hex');
}
function generate_t(domain,length_in_bits){
  var start = +new Date();
  var hash = sha1_last_u32(domain);
  console.log("hash " + hash);
  var rng = new mersenne.MersenneTwister19937();
  rng.init_genrand(hash);
  var t=[];
  var t_len=1<<length_in_bits;
  for(var i=0;i<t_len;++i){
    var p=rng.genrand_int32()%(i+1);
    if(p==i){
      t.push(i);
    }else{
      t.push(t[p]);
      t[p]=i;
    }
  }
  for(var i=0;i<t_len;++i){
    if(t[i]<0 || t[i]>=(1<<length_in_bits)){
      console.log("bad entry in t table",i,t[i]);
    }
  }
  console.log("t[] generated in " + (+new Date() - start));
  return t;
}
function generate_numbers(service,count,length_in_bits){
  var start = +new Date();
  var hash = sha1_last_u32(service);
  console.log("hash " + hash);
  var rng = new mersenne.MersenneTwister19937();
  rng.init_genrand(hash);
  var numbers=[];
  var MASK = -1>>>(32-length_in_bits);
  for(var i=0;i<count;++i){
    numbers.push(rng.genrand_int32()&MASK);
  }
  for(var i=0;i<count;++i){
    if(numbers[i]<0 || numbers[i]>=(1<<length_in_bits)){
      console.log("bad entry in numbers table",i,numbers[i]);
    }
  }
  console.log("numbers generated in " + (+new Date() - start));
  return numbers;
}
function get_domain(domain,next){
  if(domain in domains){
    domains_mru = _.without(domains_mru,domain);
    domains_mru.push(domain);
    next(domains[domain]);
  }else{
    var d={
      n:23,//TODO
      secret:'blah',//TODO
    };
    d.t = generate_t(domain,d.n);
    if(domains_mru.length>MAX_DOMAINS_MRU_LENGTH){
      var old_domain=domain_mru[0];
      delete domains[old_domain];
      domain_mru=_.without(domain_mru,domain);
    }
    domains[domain]=d;
    domains_mru.push(domain);
    next(d);
  }
}
app.get('/verify',function(req,res){
  res.type('application/json');
  var params = url.parse(req.url,true).query;
  console.log(params);
  function require_param(name,regexp){
    var value=params[name];
    if(typeof value === 'string'){
      if(regexp.test(value)){
        return value;
      }else{
        throw "Bad format for param " + name;
      }
    }else{
      throw "Missing param " + name;
    }
  }
  try{
    var n=require_param('n',/^\d+$/);
    var e=require_param('e',/^\d+$/);
    if(e<n){
      throw "The e is smaller than n";
    }
    var service=require_param('service',/./);
    var domain=require_param('domain',/./);
    var solutions=require_param('solutions',/^([01]+,)*[01]+$/).split(/,/g);
    if(!solutions.length){
      throw "No solutions given";
    }
    var l=solutions[0].length;
    _.each(solutions,function(solution,i){
      if(solution.length!=l){
        throw "Bad length of " + i + "-th solution";
      }
    });
  }catch(err){
    res.jsonp(400,{error: err});
    return;
  }
  get_domain(domain,function(domain_info){
    if(domain_info.n != n){
      res.jsonp(403,{error: "Bad n"});
      return;
    }
    if(_.every(solutions,function(solution,stamp_number){
      var numbers=generate_numbers(service +'@' + domain + ':'+ stamp_number ,l*2+1,n);
      var x=numbers[0];
      var v=numbers.slice(1,1+l);
      var w=numbers.slice(1+l);
      var c= x;
      for(var i=0;i< l;++i){
        x=domain_info.t[ (x^(solution[i]=='1'?w[i]:v[i]))>>>0 ];
        c=(c^rot(x,i+1,e))>>>0;
      }
      return 0=== (c&((1<<e)-1));
    })){
      res.jsonp({
        service:service,
        domain:domain,
        n:n,
        e:e,
        repetitions:solutions.length,
        signature:sign(domain_info,[service,domain,n,e,solutions.length]),
      });
    }else{
      res.jsonp(200,{error: "Bad solution"});
    }
  });
});
app.listen(port);
