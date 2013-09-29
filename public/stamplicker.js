var StampsLickerModule = (function(global,jsonp,MersenneTwister,sha1_last_u32){
  function generate_t(domain,length_in_bits){
    var start = +new Date();
    var hash = sha1_last_u32(domain);
    console.log("hash " + hash);
    var rng = new MersenneTwister(hash);
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
    var rng = new MersenneTwister(hash);
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
  function rot(x,bits,e){
    bits%=e;
    return ((x>>>(e-bits))|(x<<bits))>>>0;
  }
  function verify(b,challenge){
    var x=challenge.x0;
    var c= x;
    for(var i=0;i< challenge.l;++i){
      x=challenge.t[ (x^(b[i]?challenge.w[i]:challenge.v[i]))>>>0 ];
      c=(c^rot(x,i+1,challenge.e))>>>0;
    }
    return 0=== (c&((1<<challenge.e)-1));
  }
  function merge(a,b){
    var c={};
    for(x in a){
      c[x]=a[x];
    }
    for(x in b){
      c[x]=b[x];
    }
    return c;
  }
  /*function show(c){
    var s = [
      [c.x0,c.e,c.l,c.n].join(' '),
      c.v.join(' '),
      c.w.join(' '),
      c.t.join(' '),
    ].join(' ');
    $(document.body).grab(new Element('div',{
      html:s
    }))
  }*/
  function solve(challenge,on_success,on_failure){
    //show(challenge);
    var b=[];
    var mask = (1<<challenge.e)-1;
    var t=challenge.t;
    var ops=[challenge.v,challenge.w];
    var start = +new Date();
    var effort=0;
    function go(x,i,c){
      var bits=i%challenge.e;
      c=(c^( (((x>>>(challenge.e-bits)) | (x<<bits)))>>>0 ))>>>0;

      if(i==challenge.l){
        effort++;
        return (c & mask) === 0;
      }else{
        for(var choice=0;choice<2;choice++){
          b[i]=choice;
          if(go(t[(x^ops[choice][i])>>>0],i+1,c)){
            return true;
          }
        }
      }
    }
    if(go(challenge.x0,0,0)){
      console.log("Solution found in " + (+new Date() -start) + " effort:" + effort );
      if(verify(b,challenge)){
        on_success(b,effort);
      }else{
        on_failure();
      }
    }else{
      on_failure();
    }
  }

  var StampLicker = function(service,config,t){
    this.config = config;
    this.service = service;
    this.t=t;

  }

  StampLicker.prototype.lick = function(config){
    if(!config)config={};
    var merged_config = merge(this.config,config);
    var on_failure = merged_config.on_failure || function(){};
    var on_success = merged_config.on_success || function(){};
    var verifier_endpoint = merged_config.verifier_endpoint;
    var domain = merged_config.domain;
    var service = this.service;

    var solutions = [];
    var common_challenge = {
      n:merged_config.n,
      e:merged_config.e,
      t:this.t,
      l:merged_config.l
    }
    var total_effort=0;
    var start=+new Date();
    function single_stamp(stamp_number){
      console.log("Stamp number " + stamp_number);
      var numbers=generate_numbers(service +'@' + merged_config.domain + ':'+ stamp_number ,merged_config.l*2+1,merged_config.n);
      var challenge = merge(common_challenge,{
        v:numbers.slice(1,1+merged_config.l),
        w:numbers.slice(1+merged_config.l),
        x0:numbers[0]
      });
      solve(challenge,function(solution,effort){
        total_effort+=effort;
        solutions[stamp_number]=solution.join('');
        if(stamp_number == merged_config.repetitions-1){
          console.log("Got all solutions in " + (+new Date() - start) + " and total_effort" + total_effort);
          jsonp({
            url: verifier_endpoint,
            method: 'POST',
            data: {
              service:service,
              domain:domain,
              n:challenge.n,
              e:challenge.e,
              solutions:solutions.join(',')
            },
            success: function(response){
              if(response && response.signature){
                on_success(response);
              }else{
                on_failure(response);
              }
            },
            failure: on_failure
          });
        }else{
          global.setTimeout(function(){single_stamp(stamp_number+1);},0);
        }
      },on_failure);
    }
    single_stamp(0);
  }

  var DomainStampsLicker = function(config){
    this.config = config;
    this.t = generate_t(config.domain,config.n);
  }
  DomainStampsLicker.prototype.getStampLicker = function(service){
    return new StampLicker(service,this.config,this.t);
  }

  return {
    DomainStampsLicker:DomainStampsLicker,
  }

});


